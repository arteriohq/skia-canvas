// Assemble a root npm archive from the native archives built by prebuild.mjs.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {resolve, join} from 'node:path'

const directory = resolve(process.argv[2] || 'packages')
const repository = process.env.GITHUB_REPOSITORY || 'arteriohq/skia-canvas'
assert.equal(repository, 'arteriohq/skia-canvas', 'Release packages must use the Arterio fork')
const manifest = JSON.parse(await readFile('package.json', 'utf8'))
assert.match(manifest.version, /^\d+\.\d+\.\d+-rc\d+-arterio\.\d+$/)
const tag = `v${manifest.version}`
const base = `https://github.com/${repository}/releases/download/${tag}`
const nativeDirectory = resolve('lib/native')
await mkdir(nativeDirectory, {recursive:true})
const nativePackages = []
for (const triplet of ['darwin-arm64', 'linux-x64-glibc']){
  const filename = `skia-canvas-${triplet}-${manifest.version}.tgz`
  const archive = join(directory, filename)
  const native = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], {encoding:'utf8'}))
  const [os, cpu, libc] = triplet.split('-')
  assert.equal(native.name, `@skia-canvas/${triplet}`)
  assert.equal(native.version, manifest.version)
  assert.deepEqual(native.os, [os])
  assert.deepEqual(native.cpu, [cpu])
  if (libc) assert.deepEqual(native.libc, [libc])
  const binary = execFileSync('tar', ['-xOf', archive, 'package/skia.node'], {maxBuffer:128 * 1024 * 1024})
  await writeFile(join(nativeDirectory, `${triplet}.node`), binary)
  nativePackages.push({name:native.name, file:filename, sha256:hash(await readFile(archive))})
}
// URL subdependencies are blocked by pnpm 11. Bundle both supported binaries.
delete manifest.optionalDependencies
manifest.files = [...new Set([...manifest.files, 'lib/native/*.node'])]
manifest.repository = {type:'git', url:`git+https://github.com/${repository}.git`}
manifest.bugs = {url:`https://github.com/${repository}/issues`}
delete manifest.prebuild
manifest.arterio = {sourceCommit:process.env.GITHUB_SHA, features:['portable-fonts'], gpu:false}
await writeFile('package.json', JSON.stringify(manifest, null, 2) + '\n')
const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', directory], {encoding:'utf8'}))
const root = packed[0]
assert(!root.files.some(({path}) => path === 'lib/skia.node'), 'Root archive includes a local build override')
await writeFile(join(directory, 'release.json'), JSON.stringify({
  repository, tag, version:manifest.version, sourceCommit:process.env.GITHUB_SHA,
  root:{file:root.filename, url:`${base}/${root.filename}`, sha256:hash(await readFile(join(directory, root.filename)))},
  nativePackages,
}, null, 2) + '\n')
console.log(`Assembled ${root.filename} with ${nativePackages.length} native packages`)

function hash(bytes){
  return createHash('sha256').update(bytes).digest('hex')
}
