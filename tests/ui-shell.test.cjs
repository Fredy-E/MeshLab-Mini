'use strict';
/* UI shell regression for MeshLab Mini redesign.
 * Proves focused geometry workbench: revision marker, honest notice,
 * family tokens, real viewport + stats + export/fallback guidance,
 * with geometry/normal/OBJ/fallback behavior untouched.
 * Run: node tests/ui-shell.test.cjs (RED before revamp, GREEN after).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (n) => fs.readFileSync(path.join(ROOT, n), 'utf8');

test('workbench shell revision marker exists', () => {
  const html = read('index.html');
  assert.ok(html.includes('data-ui-revision="portfolio-preview-1"'), 'main must carry data-ui-revision="portfolio-preview-1"');
});

test('honest prototype notice is present with exact wording', () => {
  const html = read('index.html');
  assert.ok(html.includes('id="prototype-notice"'), '#prototype-notice must exist');
  assert.ok(html.includes('Experimental concept prototype \u2014 idea exploration only.'), 'exact prototype phrase required');
  assert.match(html, /not (a )?finished/i, 'must state not finished');
  assert.match(html, /production-ready/i, 'must state not production-ready');
});

test('family tokens honor system colors without new persistence', () => {
  const css = read('style.css');
  for (const tok of ['--ui-bg', '--ui-surface', '--ui-ink', '--ui-muted', '--ui-accent', '--ui-border', '--ui-radius']) {
    assert.ok(css.includes(tok), 'style.css must define ' + tok);
  }
  assert.match(css, /color-scheme:\s*light\s+dark/, 'must honor automatic system colors');
  assert.match(css, /prefers-color-scheme:\s*light/, 'must adapt to light scheme without persistence');
});

test('keyboard focus, reduced motion, and print stay provable', () => {
  const css = read('style.css');
  assert.match(css, /:focus-visible/, 'visible keyboard focus required');
  assert.match(css, /prefers-reduced-motion/, 'reduced-motion handling required');
  assert.match(css, /@media\s+print/, 'print styles required');
});

test('narrow viewports contain via inner scrolling, not hidden overflow', () => {
  const css = read('style.css');
  assert.ok(!/overflow-x\s*:\s*hidden/.test(css), 'must not camouflage with overflow-x:hidden');
  assert.match(css, /min-width:\s*0/, 'grid children must allow min-width:0');
  assert.match(css, /\.canvas-wrap\s*\{[^}]*overflow:\s*auto/, 'inner canvas wrapper (.canvas-wrap) must scroll internally via overflow:auto');
});

test('geometry controls, viewport, stats, and fallback wiring preserved', () => {
  const html = read('index.html');
  for (const id of ['shape', 'segments', 'rings', 'segment-value', 'ring-value', 'wire', 'normals', 'export', 'canvas', 'counts', 'message']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing id="' + id + '"');
  }
  assert.match(html, /vertices \u00b7 .* triangles/, 'real mesh statistics format must remain');
  assert.match(html, /WebGL2/i, 'WebGL2/fallback guidance must remain explicit');
  assert.match(html, /Export OBJ|export/i, 'export action must remain explicit');
  assert.match(html, /sphere|torus|cylinder/i, 'three parametric surfaces must remain listed');
});

test('offline safety unchanged: no new runtime/network deps', () => {
  const html = read('index.html');
  const css = read('style.css');
  assert.ok(!html.includes('https://') && !html.includes('http://'), 'index.html must stay offline (no http URLs)');
  assert.ok(!css.includes('@import'), 'no CSS imports');
  assert.ok(!/url\(/.test(css), 'no url() resources');
});
