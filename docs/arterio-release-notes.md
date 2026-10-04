This Arterio build includes the optional portable FreeType font manager and the
lossless PDF image option (`quality: 1.01`). It uses CPU rendering.

The root npm archive contains both native macOS ARM64 and Linux x64 glibc
binaries. Its loader selects the correct one. This avoids URL subdependencies
blocked by pnpm 11. The release also includes the standalone native archives,
SHA-256 checksums, and a manifest with the source commit.

Before publication, GitHub Actions compares native macOS and Linux text metrics,
Canvas pixels, and PDF pixels, then installs and renders through the assembled
root archive with npm and Arterio's pnpm 11.20.0 on both systems. After publication, it repeats installation from the
release URLs.

Pin Arterio's `skia-canvas` dependency to the root archive URL and commit the
pnpm lockfile. This release does not change Arterio's installed dependency.
