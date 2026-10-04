//
// Check the npm packaging pipeline (for CI testing)
//

import {execSync} from 'child_process'
import {existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync} from 'fs'
import {tmpdir} from 'os'
import {join, resolve} from 'path'
import assert from 'node:assert/strict'

const ROOT = resolve(`${import.meta.dirname}/..`)
const sh = (cmd, opts={}) => execSync(cmd, {stdio:'pipe', encoding:'utf8', ...opts})

const releaseDirectory = process.argv[2] && resolve(process.argv[2])
const published = process.argv.includes('--published')
if (!releaseDirectory && !existsSync(`${ROOT}/lib/skia.node`)){
  console.error(`No lib/skia.node found — build or download one first`)
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'skia-canvas-packaging-'))
try{
  let platformPkg, tarballs
  if (releaseDirectory){
    const {familySync} = await import('detect-libc')
    const triplet = [process.platform, process.arch, process.platform == 'linux' ? familySync() : null].filter(Boolean).join('-')
    platformPkg = `@skia-canvas/${triplet}`
    const {version} = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const filename = `skia-canvas-${version}.tgz`
    const root = JSON.parse(sh(`tar -xOf "${join(releaseDirectory, filename)}" package/package.json`))
    const base = `https://github.com/arteriohq/skia-canvas/releases/download/v${version}`
    assert.equal(root.optionalDependencies[platformPkg], `${base}/skia-canvas-${triplet}-${version}.tgz`)
    tarballs = published ? [`${base}/${filename}`] : [join(releaseDirectory, filename), join(releaseDirectory, `skia-canvas-${triplet}-${version}.tgz`)]
  }else{
    // reuse the normal platform package builder for the original packaging check
    sh(`node "${ROOT}/lib/prebuild.mjs" packages --local`)
    let [platformDir] = readdirSync(`${ROOT}/assets/npm`)
    platformPkg = `@skia-canvas/${platformDir}`
    console.log(`Packing skia-canvas + ${platformPkg}`)
    tarballs = [ROOT, `${ROOT}/assets/npm/${platformDir}`].map(dir =>
      join(work, sh(`npm pack "${dir}" --silent`, {cwd:work}).trim().split('\n').pop())
    )
  }

  // install both into a scratch project the same way an end user would get them
  let app = join(work, 'app')
  mkdirSync(app)
  writeFileSync(join(app, 'package.json'), JSON.stringify({name:'packaging-probe', private:true}))
  console.log(`Installing with --ignore-scripts into ${app}`)
  sh(`npm install --ignore-scripts --no-audit --no-fund ${releaseDirectory && !published ? '--omit=optional' : ''} ${tarballs.map(t => `"${t}"`).join(' ')}`, {cwd:app})

  if (existsSync(join(app, 'node_modules/skia-canvas/lib/skia.node'))){
    throw Error(`lib/skia.node was included in the packed module — the loader's platform-package path went untested`)
  }

  // render through the platform package
  writeFileSync(join(app, 'probe.mjs'), `
    import assert from 'node:assert/strict'
    import {Canvas, FontLibrary, loadImage, loadCanvas} from 'skia-canvas'
    let canvas = new Canvas(32, 32),
        ctx = canvas.getContext('2d')
    ctx.fillStyle = 'red'
    ctx.fillRect(0, 0, 32, 32)
    let buf = await canvas.toBuffer('png')
    if (buf.readUInt32BE(0) != 0x89504e47) throw Error('output is not a PNG')
    if (${Boolean(releaseDirectory)}){
      assert.deepEqual(FontLibrary.families.filter(name => name !== ''), [])
      FontLibrary.use('PackageFont', ${JSON.stringify(join(ROOT, 'tests/assets/fonts/montserrat-latin/montserrat-v30-latin-regular.woff2'))})
      ctx.font = '12px PackageFont'
      assert(ctx.measureText('Installed font').width > 0)
    }
    // Opaque bitmap data checks actual PDF image encoding through the native module.
    const imageCanvas = new Canvas(64, 64, {gpu:false})
    const imageContext = imageCanvas.getContext('2d')
    const pixels = imageContext.createImageData(64, 64)
    for (let i = 0; i < pixels.data.length; i += 4){
      pixels.data[i] = (i * 13) % 251
      pixels.data[i+1] = (i * 17) % 253
      pixels.data[i+2] = (i * 23) % 255
      pixels.data[i+3] = 255
    }
    imageContext.putImageData(pixels, 0, 0)
    const pdfCanvas = new Canvas(64, 64, {gpu:false})
    pdfCanvas.getContext('2d').drawImage(await loadImage(await imageCanvas.toBuffer('png')), 0, 0)
    const normal = await pdfCanvas.toBuffer('pdf')
    const lossless = await pdfCanvas.toBuffer('pdf', {quality:1.01})
    assert(normal.includes(Buffer.from('/DCTDecode')), 'Normal PDF did not exercise JPEG encoding')
    assert(!lossless.includes(Buffer.from('/DCTDecode')), 'Lossless PDF uses JPEG encoding')
    const decoded = await loadCanvas(lossless, {gpu:false})
    assert.deepEqual(decoded.getContext('2d').getImageData(0, 0, 64, 64).data, pixels.data)
    assert.throws(() => pdfCanvas.toBufferSync('png', {quality:1.01}), /quality/)
    console.log('render ok')
  `)
  let rendered = sh(`node probe.mjs`, {cwd:app})
  if (!rendered.includes('render ok')) throw Error(`probe render failed:\n${rendered}`)
  console.log(`✓ rendering works via ${platformPkg}`)

  // with the platform package gone, the loader should fail loudly & specifically
  rmSync(join(app, 'node_modules/@skia-canvas'), {recursive:true})
  let failure
  try{
    sh(`node probe.mjs`, {cwd:app})
    throw Error(`loader unexpectedly succeeded with no binary present`)
  }catch(e){
    failure = `${e.stderr || ''}${e.stdout || ''}${e.message}`
  }
  for (const expected of [platformPkg, 'supportedArchitectures', 'prebuild.mjs download']){
    if (!failure.includes(expected)) throw Error(`missing-binary error doesn't mention "${expected}":\n${failure}`)
  }
  console.log(`✓ missing-binary error names ${platformPkg} and remedies`)

  console.log(`\npackaging checks passed`)
}finally{
  rmSync(work, {recursive:true, force:true})
}
