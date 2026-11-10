// End-to-end test for the video tool (ffmpeg.wasm in the browser).
const PORT = process.env.CDP_PORT || 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
  }
  if (m.method === 'Log.entryAdded') {
    logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text}`);
  }
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
const evaluate = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return { value: r.result.value };
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/video' });
await sleep(2500);

console.log('click sample:', JSON.stringify(await evaluate(`(async()=>{const b=document.querySelector('[data-act="sample"]'); if(!b) return 'no sample btn'; b.click(); await new Promise(r=>setTimeout(r,1800)); return document.querySelector('.file-name')?.textContent||'no file';})()`)));

console.log('start:', JSON.stringify(await evaluate(`(()=>{const b=document.querySelector('#convert-btn'); if(!b) return 'no convert btn'; b.click(); return 'clicked';})()`)));

const started = Date.now();
let done = false;
let lastState = '';
while (Date.now() - started < 240000) {
  await sleep(3000);
  const r = await evaluate(`JSON.stringify({
    link: !!document.querySelector('#output-slot a[download]'),
    prog: document.querySelector('#progress-pct')?.textContent || '',
    label: document.querySelector('#progress-label')?.textContent || '',
    status: document.querySelector('#engine-note')?.textContent || '',
    alert: document.querySelector('#video-alert')?.innerText || '',
    hidden: document.querySelector('#video-progress')?.hidden,
    size: document.querySelector('.file-meta')?.textContent || ''
  })`);
  const state = r.value || '';
  if (state !== lastState) {
    console.log(`t+${Math.round((Date.now() - started) / 1000)}s`, state);
    lastState = state;
  }
  if (state.includes('"link":true')) { done = true; break; }
  if (state.includes('失败')) { done = true; break; }
}

console.log('done:', done);
console.log('logs:\n' + logs.slice(-40).join('\n'));
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
process.exit(0);
