const assert = require('node:assert/strict');
const geometry = require('../geometry.js');

for (const type of ['sphere', 'torus', 'cylinder']) {
  const m = geometry.surface(type, 32, 16);
  assert.equal(m.positions.length, m.normals.length);
  assert(m.indices.every((i) => i >= 0 && i < m.positions.length / 3));
  assert(m.positions.every(Number.isFinite));
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3;
    const u = [0, 1, 2].map((k) => m.positions[b + k] - m.positions[a + k]);
    const v = [0, 1, 2].map((k) => m.positions[c + k] - m.positions[a + k]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(...cross);
    if (area < 1e-8) continue;
    const n = [0, 1, 2].map((k) => m.normals[a + k] + m.normals[b + k] + m.normals[c + k]);
    assert(cross.reduce((s, x, k) => s + x * n[k], 0) > 0, `${type}: inward face`);
  }
  assert(geometry.obj(m).includes('f 1//1'));
}
console.log('Passed: mesh bounds, winding, normals, and OBJ export.');
