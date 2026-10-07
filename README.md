<h1 align="center">MeshLab Mini</h1>

<p align="center">
  <strong>Explore geometry. See the mesh. Export what you build.</strong><br>
  A tiny, independent WebGL2 procedural mesh explorer — no packages, no network requests.
</p>

<p align="center">
  <a href="https://github.com/Fredy-E/MeshLab-Mini/actions/workflows/verify.yml"><img src="https://github.com/Fredy-E/MeshLab-Mini/actions/workflows/verify.yml/badge.svg" alt="verify"></a>
  <img src="https://img.shields.io/badge/platform-browser-29354b?style=flat-square" alt="Platform: browser">
  <img src="https://img.shields.io/badge/dependencies-none-737373?style=flat-square" alt="No dependencies">
  <img src="https://img.shields.io/badge/status-prototype-737373?style=flat-square" alt="Status: prototype">
  <img src="https://img.shields.io/badge/license-MIT-737373?style=flat-square" alt="License: MIT">
</p>

## What this is

Open `index.html` in a modern browser. Choose a sphere, torus, or capped cylinder; adjust subdivisions; rotate and zoom; inspect wireframe or object-space normal colors; and export OBJ geometry with normals.

The renderer uses WebGL2 directly. The mesh generator and OBJ exporter still work when WebGL2 is unavailable. There are no runtime packages or network requests.

This is an independent small procedural explorer and is **not affiliated with the MeshLab project**.

## Checks

```sh
node tests/geometry.test.cjs
```

The checks cover mesh bounds, face winding, normals, and OBJ output; CI runs them on every push (badge above).

## Next

More parametric surfaces, topology diagnostics, and an actual normal-vector overlay.

## See also

[DriverLens](https://github.com/Fredy-E/DriverLens) · [ARM64 Compatibility Radar](https://github.com/Fredy-E/ARM64-Compatibility-Radar) · [Diagnostic Scan Diff](https://github.com/Fredy-E/Diagnostic-Scan-Diff) · [Offline Museum Kit](https://github.com/Fredy-E/Offline-Museum-Kit) — small local-first tools built for Windows-on-ARM work.
