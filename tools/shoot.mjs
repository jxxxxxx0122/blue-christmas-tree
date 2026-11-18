// 用 CDP 精确模拟视口并截图（无头 Chrome 的 --window-size 会被钳制，不能用于手机尺寸）
// 用法: node tools/shoot.mjs <out.png> [宽] [高] [DPR] [URL后缀] [等待毫秒]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [out, w = '390', h = '844', dpr = '2', suffix = '', waitMs = '2500'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/shoot.mjs <out.png> [w] [h] [dpr] [suffix] [waitMs]');
  process.exit(2);
}

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'bct-chrome-'));
const url = pathToFileURL(resolve('index.html')).href + suffix;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, [
  '--headless=new',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

let ws;
const errors = [];

async function findTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('Chrome 调试端口未就绪');
}

function connect(target) {
  return new Promise((resolvePromise, reject) => {
    ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();

    ws.onopen = () => resolvePromise({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
    });
    ws.onerror = (e) => reject(new Error('WebSocket 失败: ' + (e.message || 'unknown')));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        errors.push('exception: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push('console: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        errors.push('log: ' + msg.params.entry.text);
      }
    };
  });
}

try {
  const target = await findTarget();
  const cdp = await connect(target);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: Number(w),
    height: Number(h),
    deviceScaleFactor: Number(dpr),
    mobile: true,
  });
  if (process.env.REDUCED === '1') {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  }
  await cdp.send('Page.navigate', { url });

  let ready = false;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'document.documentElement.dataset.ready === "1" && !document.querySelector("#error.visible")',
      returnByValue: true,
    });
    if (r.result && r.result.value) { ready = true; break; }
    await sleep(200);
  }
  if (!ready) throw new Error('场景未在 25 秒内就绪（或页面报错）');

  await sleep(Number(waitMs));

  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

  if (process.env.TAP === '1') {
    const tx = Number(process.env.TAP_X || 195);
    const ty = Number(process.env.TAP_Y || 420);
    await touch('touchStart', [{ x: tx, y: ty, radiusX: 2, radiusY: 2, force: 1, id: 1 }]);
    await sleep(80);
    await touch('touchEnd', []);
    await sleep(600);
    const r = await cdp.send('Runtime.evaluate', { expression: 'BCT.burst.activeCount()', returnByValue: true });
    console.log('burst active after tap:', r.result.value);
    if (!r.result.value) errors.push('tap produced no burst');
  }

  if (process.env.DRAG === '1') {
    await touch('touchStart', [{ x: 195, y: 420, radiusX: 2, radiusY: 2, force: 1, id: 1 }]);
    for (let i = 1; i <= 4; i++) {
      await sleep(40);
      await touch('touchMove', [{ x: 195 + i * 18, y: 420 + i * 6, radiusX: 2, radiusY: 2, force: 1, id: 1 }]);
    }
    await sleep(40);
    await touch('touchEnd', []);
    await sleep(400);
    const r = await cdp.send('Runtime.evaluate', { expression: 'BCT.burst.activeCount()', returnByValue: true });
    console.log('burst active after drag:', r.result.value);
    if (r.result.value > 0) errors.push('drag produced a burst');
  }

  if (process.env.MULTITAP) {
    const n = Number(process.env.MULTITAP);
    for (let i = 0; i < n; i++) {
      await touch('touchStart', [{ x: 195, y: 420, radiusX: 2, radiusY: 2, force: 1, id: 1 + i }]);
      await sleep(60);
      await touch('touchEnd', []);
      await sleep(200);
    }
    await sleep(400);
    const r = await cdp.send('Runtime.evaluate', { expression: 'BCT.burst.activeCount()', returnByValue: true });
    console.log(`burst active after ${n} taps:`, r.result.value);
    if (r.result.value < 90) errors.push(`${n} rapid taps exhausted the burst pool (only ${r.result.value} active)`);
  }

  if (process.env.BLOOM_TEST === 'byte') {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.BCT && BCT.bloomType', returnByValue: true });
    console.log('bloom type:', r.result.value);
    if (r.result.value !== 'byte') errors.push('forced byte bloom fallback is not active');
  }

  if (process.env.VIEWPORT_TEST === '1') {
    const before = await cdp.send('Runtime.evaluate', { expression: 'BCT.CONFIG.camera.radius', returnByValue: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: Number(w),
      height: Number(h) - 90,
      deviceScaleFactor: Number(dpr),
      mobile: true,
    });
    await sleep(800);
    const after = await cdp.send('Runtime.evaluate', {
      expression: '({ radius: BCT.CONFIG.camera.radius, cw: document.getElementById("stage").clientWidth, ch: document.getElementById("stage").clientHeight })',
      returnByValue: true,
    });
    console.log('viewport test:', JSON.stringify({ before: before.result.value, ...after.result.value }));
    if (Math.abs(before.result.value - after.result.value.radius) > 0.5) {
      errors.push('camera re-framed on a height-only viewport change');
    }
    if (after.result.value.ch !== Number(h) - 90) {
      errors.push('canvas height does not follow the visual viewport');
    }
  }

  const layout = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      return JSON.stringify({ viewport: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio, ui: rect('#ui'), h1: rect('#ui h1'), year: rect('#ui .year'), hint: rect('#hint') });
    })()`,
    returnByValue: true,
  });
  console.log('layout:', layout.result.value);

  const errCheck = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const e = document.querySelector('#error'); return e && e.classList.contains('visible') ? e.textContent : ''; })()`,
    returnByValue: true,
  });
  if (errCheck.result.value) errors.push('overlay: ' + errCheck.result.value);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));

  if (errors.length) {
    console.error('FAIL: page errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`OK: ${out} (${w}x${h} @${dpr}x)`);
  }
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch (_) {}
  try { proc.kill(); } catch (_) {}
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}
