# Portable font rendering

The optional `portable-fonts` build feature uses bundled FreeType and Skia's
custom empty font manager for Canvas text and embedded PDF fonts. The default
build continues to use the platform font manager.

## Source builds

Install the normal source build tools (Rust, Python, Clang/libclang, and Ninja),
then run:

```sh
npm ci --ignore-scripts
npm run build -- --portable-fonts
```

For a CPU-only release build:

```sh
npm run build -- custom portable-fonts --release
```

The build command forces a Skia source build and supplies the GN settings needed
to enable bundled FreeType on macOS. Cargo's FreeType features alone do not enable
that backend on macOS. Direct Cargo builds must also set these variables:

```sh
export FORCE_SKIA_BUILD=1
export SKIA_GN_ARGS='skia_use_freetype=true skia_use_system_freetype2=false skia_use_freetype_woff2=true skia_enable_fontmgr_custom_empty=true'
cargo build --release --features portable-fonts
```

This mode does not discover system fonts. Load every required font, including
fallback fonts, with `FontLibrary.use()`. Use identical font files and rendering
settings on both systems. For the tested CPU configuration, use `gpu: false`,
`textContrast: 0`, `textGamma: 1.4`, and an sRGB context. Set `fontHinting` to false,
`fontSmoothing` to true, and `fontSynthesis` to false.

Upstream's supplied binaries retain the default behavior. The Arterio release
binaries enable this feature. These tests establish parity for the supplied samples, not
for every font, architecture, or drawing operation.

## Native regression test plan

The cross-platform test covers these failure modes through the public API:

- A platform font manager is still selected: reject named system font families
  before loading the fixtures and compare independent macOS and Linux captures.
- Explicit TTF, variable, WOFF, or WOFF2 fonts do not load: require a positive
  advance and visible glyph pixels for each face.
- Text bounds or advances differ: compare the complete measured and wrapped
  text results at integer and fractional sizes and letter spacing.
- PDF import uses another font manager: export and reload a PDF, then compare its
  decoded pixels on both platforms.
- Process locale changes output: compare captures from two locales.
- The comparison hides drawing changes: change a label and remove a thin line;
  require both Canvas and PDF pixels to differ.

The existing default-build tests continue to cover platform font behavior. They
cannot establish parity because their results are not compared across systems.
The portable workflow uses the real native module and the font files already in
`tests/assets/fonts`, without mocks or system font dependencies. It retains PNG,
PDF, RGBA, and measurement artifacts for inspection.

To reproduce a capture and compare it with a capture from another machine:

```sh
node tests/portable-fonts/capture.mjs /tmp/portable-capture
node tests/portable-fonts/compare.mjs /tmp/portable-capture /tmp/other-capture
```

## Arterio package delivery checks

The Arterio workflow extends this existing native workflow and package builder.
It protects the delivery contract before a release is published:

- Both native tarballs must contain the same fork version and the expected OS,
  CPU architecture, and libc declarations.
- The root tarball must contain both native binaries. A clean installation
  must load the binary for the current platform; the root tarball must not
  contain an accidentally copied local `lib/skia.node`.
- The installed package must still expose no system fonts in portable mode.
  It must render a PNG and load an explicitly supplied font.
- The lossless PDF option must retain opaque bitmap pixels after PDF export and
  import. The normal PDF encoding must differ, so the check cannot pass on a
  blank image or an image that never used JPEG encoding.
- The same clean installation is repeated from the published release URLs to
  check actual dependency delivery, rather than only local tarball installation.

Application E2E tests cannot check these package and release boundaries until
Arterio has installed this dependency. These checks use the actual npm archives,
real native binaries, and real rendering. No production test hooks are added.

The pnpm 11 check found a delivery failure that npm does not catch:
`blockExoticSubdeps` rejects native optional dependencies specified as release
URLs, including with explicit overrides. The Arterio root archive therefore
contains both native binaries under `lib/native`. Its loader selects by OS,
architecture, and libc. This avoids URL subdependencies without disabling pnpm's
protection. Native standalone archives remain available as release assets.

The primary delivery test installs the root archive alone with both npm and
Arterio's pnpm 11.20.0, loads the selected bundled binary, renders PNG and PDF,
and checks the lossless bitmap pixels. It also removes the bundled binaries and
requires a descriptive missing-binary error. The original upstream packaging
check still verifies the separate native optional dependency path.
