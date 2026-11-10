// Usage: node shot.mjs <url> <out.png> [width] [height|full] [scale]
import fs from 'node:fs';

const PORT = process.env.CDP_PORT || 9333;
const [, , url, out, wArg, hArg, sArg] = process.argv;
const width = Number(wArg || 1440);
const height = hArg === 'full' ? null : Number(hArg || 1000);
const scale = Number(sArg || 1);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newTarget() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  return r.json();
}

const target = await newTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res, rej) => {
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const THEME = process.env.THEME || 'dark';
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: THEME }] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('pd-theme', JSON.stringify('${THEME}'))}catch(e){}` });
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height: height ?? 1000,
  deviceScaleFactor: scale,
  mobile: width < 700,
});
if (width < 700) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
}
await send('Page.navigate', { url });
await sleep(1200);
// wait for network-ish idle / fonts
await send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(()=>1) : 1', awaitPromise: true });
await sleep(1200);

if (height === null && !process.env.FOLD) {
  const { result } = await send('Runtime.evaluate', {
    expression: `JSON.stringify({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})`,
    returnByValue: true,
  });
  const { h } = JSON.parse(result.value);
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: Math.min(h, 8000),
    deviceScaleFactor: scale,
    mobile: width < 700,
  });
  await sleep(600);
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: process.env.FOLD ? false : true });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);

// dump some diagnostics
const diag = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    h: document.documentElement.scrollHeight,
    w: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    fonts: getComputedStyle(document.body).fontFamily,
    bg: getComputedStyle(document.body).backgroundColor,
    headings: [...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent.trim()).slice(0,40)
  })`,
  returnByValue: true,
});
console.log(diag.result.value);
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
process.exit(0);
