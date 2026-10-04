This Arterio build includes the optional portable FreeType font manager and the
lossless PDF image option (`quality: 1.01`). It uses CPU rendering.

The root npm archive selects our native macOS ARM64 or Linux x64 glibc archive
through optional dependencies. The release contains those three archives,
SHA-256 checksums, and a manifest with the source commit.

Before publication, GitHub Actions compares native macOS and Linux text metrics,
Canvas pixels, and PDF pixels, then installs and renders through the assembled
archives on both systems. After publication, it repeats installation from the
release URLs.

Pin Arterio's `skia-canvas` dependency to the root archive URL and commit the
pnpm lockfile. This release does not change Arterio's installed dependency.
