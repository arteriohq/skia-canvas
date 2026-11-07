This Arterio build includes the optional portable FreeType font manager and the
lossless PDF image option (`quality: 1.01`). It uses CPU rendering.

The root npm archive contains native macOS ARM64, Linux x64 glibc, and Linux
ARM64 glibc binaries. The Linux binaries are built on Debian 12 with clang 19
and need glibc 2.36 or later, so they run on Debian 12, Debian 13, and Ubuntu
24.04. The loader selects the correct binary. This avoids URL subdependencies
blocked by pnpm 11. The release also includes standalone native archives,
SHA-256 checksums, and a manifest with the source commit.

Before publication, GitHub Actions compares native macOS with both Linux
architectures' text metrics, Canvas pixels, and PDF pixels, then installs and renders through the assembled
root archive with npm and Arterio's pnpm 11.20.0 on macOS and Debian 12. After publication, it repeats installation from the
release URLs.

Pin Arterio's `skia-canvas` dependency to the root archive URL and commit the
pnpm lockfile. This release does not change Arterio's installed dependency.
