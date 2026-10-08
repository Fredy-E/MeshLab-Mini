'use strict';
/*
 * End-to-end browser checks for MeshLab Mini.
 *
 * Run:
 *   npm ci
 *   npm run test:browser
 *
 * Browser selection (optional env):
 *   PW_CHANNEL=chrome    use the locally installed Chrome (default on dev machines)
 *   PW_CHANNEL=msedge    use the locally installed Edge
 *   PW_CHANNEL=bundled   force the Playwright-bundled Chromium
 *   unset + CI=true      bundled Chromium (CI: npx playwright install chromium)
 *
 * Every check runs in its own isolated browser context. Rendering checks read
 * real pixels back from the WebGL2 drawing buffer (forced redraw via the app's
 * own change handlers, so no preserveDrawingBuffer is needed). The app is
 * opened both via file:// (primary usage) and through a loopback-only static
 * server that serves a fixed allowlist of files (hosted-compatibility check).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'test-results');
const FILE_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SERVE_ALLOWLIST = ['index.html', 'style.css', 'geometry.js', 'renderer.js'];
const TEST_TIMEOUT_MS = 60_000;

function launchOptions() {
  const channel = process.env.PW_CHANNEL;
  if (channel === 'bundled' || channel === '') return {};
  if (channel) return { channel };
  return process.env.CI ? {} : { channel: 'chrome' };
}

async function launchBrowser() {
  const { chromium } = require('playwright');
  return chromium.launch(launchOptions());
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
    };
    const server = http.createServer((req, res) => {
      let name;
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      } catch {
        res.writeHead(400); res.end('bad request'); return;
      }
      if (name === 'favicon.ico') { res.writeHead(204); res.end(); return; } // browsers auto-request this; the app ships none
      if (!SERVE_ALLOWLIST.includes(name)) { res.writeHead(404); res.end('not found'); return; }
      try {
        const body = fs.readFileSync(path.join(ROOT, name));
        res.writeHead(200, {
          'content-type': types[path.extname(name)] || 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(body);
      } catch {
        res.writeHead(500); res.end('error');
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function trackOffsiteRequests(context, allowedPrefixes) {
  const offsite = [];
  context.on('request', (request) => {
    const url = request.url();
    if (!allowedPrefixes.some((prefix) => url.startsWith(prefix))) offsite.push(url);
  });
  return offsite;
}

function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  return errors;
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${TEST_TIMEOUT_MS} ms`)), TEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/*
 * Forces a synchronous redraw through the app's own change handler and reads
 * the drawing buffer in the same task. Background clear color is (0.025,
 * 0.045, 0.085); anything farther than a small threshold counts as model
 * pixels. `bright` counts blue-dominant lit pixels of the default material.
 */
async function canvasStats(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { webgl2: false };
    const wire = document.getElementById('wire');
    const checked = wire.checked;
    wire.checked = !checked; wire.dispatchEvent(new Event('change'));
    wire.checked = checked; wire.dispatchEvent(new Event('change'));
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBg = 0, bright = 0;
    for (let i = 0; i < px.length; i += 4) {
      const distance = Math.abs(px[i] - 6) + Math.abs(px[i + 1] - 11) + Math.abs(px[i + 2] - 22);
      if (distance > 30) nonBg += 1;
      if (px[i + 2] > 120 && px[i + 2] > px[i] + 40) bright += 1;
    }
    return { webgl2: true, w, h, nonBg, bright, total: w * h };
  });
}

async function exportObj(page, expectedName) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  assert.equal(download.suggestedFilename(), expectedName);
  return (await readDownload(download)).toString('utf8');
}

function parseObj(text) {
  const vertices = [];
  const faces = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) vertices.push(line.slice(2).split(' ').map(Number));
    else if (line.startsWith('f ')) faces.push(line.slice(2));
  }
  return { vertices, faces };
}

const maxRadius = (vertices) => Math.max(...vertices.map((v) => Math.hypot(...v)));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('file:// load: WebGL2 canvas renders a non-blank model', async (context) => {
  const offsite = trackOffsiteRequests(context, ['file://', 'blob:', 'data:']);
  const page = await context.newPage();
  const errors = trackPageErrors(page);
  await page.goto(FILE_URL);
  assert.match(await page.locator('#counts').textContent(), /^861 vertices · 1600 triangles · sphere$/);
  assert.equal(await page.locator('#canvas').isVisible(), true);
  const stats = await canvasStats(page);
  assert.equal(stats.webgl2, true, 'WebGL2 context present');
  assert.ok(stats.w > 0 && stats.h > 0, 'drawing buffer sized');
  assert.ok(stats.nonBg > 1000, `model pixels visible (nonBg=${stats.nonBg})`);
  assert.ok(stats.bright > 200, `lit model pixels visible (bright=${stats.bright})`);
  await page.screenshot({ path: path.join(ARTIFACTS, 'meshlab-file.png'), fullPage: true });
  assert.deepEqual(offsite, [], 'no requests outside file://');
  assert.deepEqual(errors, [], 'no page or console errors');
});

test('shape and subdivision changes update geometry and re-render', async (context) => {
  const page = await context.newPage();
  await page.goto(FILE_URL);
  await page.selectOption('#shape', 'cylinder');
  assert.match(await page.locator('#counts').textContent(), /^945 vertices · 1680 triangles · cylinder$/);
  await page.selectOption('#shape', 'torus');
  assert.match(await page.locator('#counts').textContent(), /^861 vertices · 1600 triangles · torus$/);
  await page.locator('#segments').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#segment-value').textContent(), '39');
  assert.match(await page.locator('#counts').textContent(), /^840 vertices · 1560 triangles · torus$/);
  const stats = await canvasStats(page);
  assert.equal(stats.webgl2, true);
  assert.ok(stats.nonBg > 500, `torus renders after changes (nonBg=${stats.nonBg})`);
});

test('OBJ export downloads actual geometry (sphere and torus)', async (context) => {
  const page = await context.newPage();
  await page.goto(FILE_URL);
  const sphereObj = await exportObj(page, 'sphere.obj');
  assert.ok(sphereObj.startsWith('# MeshLab Mini procedural export'));
  assert.ok(sphereObj.includes('\nvn '), 'normals exported');
  const sphere = parseObj(sphereObj);
  assert.equal(sphere.vertices.length, 861);
  assert.equal(sphere.faces.length, 1600);
  assert.ok(sphere.faces.every((face) => face.split(' ').every((token) => /^\d+\/\/\d+$/.test(token))), 'faces use v//vn indices');
  const sphereMax = Math.max(...sphere.faces.flatMap((face) => face.split(' ').map((token) => Number(token.split('//')[0]))));
  assert.ok(sphereMax <= sphere.vertices.length, 'face indices in range');
  const sphereRadius = maxRadius(sphere.vertices);
  assert.ok(Math.abs(sphereRadius - 1) < 0.02, `sphere radius ≈ 1 (got ${sphereRadius})`);
  assert.match(await page.locator('#counts').textContent(), new RegExp(`^${sphere.vertices.length} vertices · ${sphere.faces.length} triangles`));
  await page.selectOption('#shape', 'torus');
  const torusObj = await exportObj(page, 'torus.obj');
  const torus = parseObj(torusObj);
  assert.equal(torus.vertices.length, 861);
  const torusRadius = maxRadius(torus.vertices);
  assert.ok(Math.abs(torusRadius - 1.34) < 0.02, `torus outer radius ≈ 1.34 (got ${torusRadius})`);
  assert.notEqual(sphereRadius.toFixed(3), torusRadius.toFixed(3), 'sphere and torus export different geometry');
});

test('wireframe and normal-color toggles redraw without errors', async (context) => {
  const page = await context.newPage();
  const errors = trackPageErrors(page);
  await page.goto(FILE_URL);
  await page.click('#wire');
  assert.equal(await page.locator('#wire').isChecked(), true);
  const wireStats = await canvasStats(page);
  assert.ok(wireStats.nonBg > 200, `wireframe edges visible (nonBg=${wireStats.nonBg})`);
  await page.click('#wire');
  await page.click('#normals');
  assert.equal(await page.locator('#normals').isChecked(), true);
  const normalStats = await canvasStats(page);
  assert.ok(normalStats.nonBg > 1000, `normal-colored model visible (nonBg=${normalStats.nonBg})`);
  assert.deepEqual(errors, [], 'no page or console errors');
});

test('no-WebGL fallback keeps mesh generation and OBJ export working', async (context) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith('webgl')) return null;
      return original.call(this, type, ...rest);
    };
  });
  const page = await context.newPage();
  const errors = trackPageErrors(page);
  await page.goto(FILE_URL);
  assert.match(await page.locator('#message').textContent(), /WebGL2 is unavailable\. The mesh can still be generated and exported\./);
  assert.match(await page.locator('#counts').textContent(), /^861 vertices · 1600 triangles · sphere$/);
  const obj = await exportObj(page, 'sphere.obj');
  assert.equal(await page.locator('#canvas').isVisible(), false, 'dead canvas is not displayed');
  assert.equal(await page.evaluate(() => document.getElementById('canvas').hidden), true, 'canvas hidden flag set');
  const mesh = parseObj(obj);
  assert.equal(mesh.vertices.length, 861);
  assert.equal(mesh.faces.length, 1600);
  assert.ok(Math.abs(maxRadius(mesh.vertices) - 1) < 0.02);
  await page.click('#wire');
  await page.click('#normals');
  assert.deepEqual(errors, [], 'no page or console errors');
});

test('hosted compatibility: loopback server serves only fixed files', async (context) => {
  const { server, origin } = await startStaticServer();
  try {
    const offsite = trackOffsiteRequests(context, [`${origin}/`, 'blob:', 'data:']);
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    await page.goto(`${origin}/`);
    const stats = await canvasStats(page);
    assert.equal(stats.webgl2, true);
    assert.ok(stats.nonBg > 1000, `model pixels visible over http (nonBg=${stats.nonBg})`);
    const obj = await exportObj(page, 'sphere.obj');
    assert.equal(parseObj(obj).faces.length, 1600);
    for (const probe of ['/package.json', '/tests/geometry.test.cjs', '/%2e%2e/package.json', '/..%2fpackage.json']) {
      const response = await context.request.get(`${origin}${probe}`);
      assert.equal(response.status(), 404, `expected 404 for ${probe}`);
    }
    assert.deepEqual(offsite, [], 'no requests outside the loopback origin');
    assert.deepEqual(errors, [], 'no page or console errors');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function runTests() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const browser = await launchBrowser();
  let failures = 0;
  for (const { name, fn } of tests) {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    try {
      await withTimeout(fn(context), name);
      console.log(`ok - ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(error && error.stack ? error.stack : error);
    } finally {
      await context.close();
    }
  }
  await browser.close();
  console.log(`${tests.length - failures}/${tests.length} browser checks passed`);
  process.exit(failures ? 1 : 0);
}

module.exports = { launchBrowser, startStaticServer };

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
