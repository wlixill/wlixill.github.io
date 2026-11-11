// Functional smoke test across every tool, in a real browser.
const PORT = process.env.CDP_PORT || 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res, rej) => { pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return { value: r.result.value };
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

const results = {};
const check = (name, ok, detail) => {
  results[name] = { ok: !!ok, detail };
};

await send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
await sleep(1500);

let r = await evaluate(`JSON.stringify({ cards: document.querySelectorAll('.post-card').length, chips: document.querySelectorAll('.tool-chip').length })`);
{
  const v = JSON.parse(r.value || '{}');
  check('blog.home', v.cards >= 4 && v.chips >= 5, r.value);
}

// helper injected once
await evaluate(`window.__set = (sel, val) => { const el = document.querySelector(sel); el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return el.value; };
window.__click = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error('missing '+sel); el.click(); return true; };
'ok'`);

// JSON
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/json' });
await sleep(700);
r = await evaluate(`(async()=>{
  __set('#json-in', '{"a":1,"b":[1,2]}');
  await new Promise(r=>setTimeout(r,400));
  const out = document.querySelector('#json-out').textContent;
  __set('#json-in', '{"bad": }');
  await new Promise(r=>setTimeout(r,400));
  const status = document.querySelector('#json-status').textContent;
  return JSON.stringify({out, status});
})()`);
{
  const v = JSON.parse(r.value || '{}');
  check('json.format', /"a": 1/.test(v.out) && v.out.includes('\n'), v.out.slice(0, 40));
  check('json.error', v.status.includes('解析失败'), v.status);
}

// text
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/text' });
await sleep(500);
r = await evaluate(`(async()=>{ __set('#t-in', '你好 world\\n\\n第二行 abc'); await new Promise(r=>setTimeout(r,120)); return JSON.stringify([...document.querySelectorAll('[data-stat]')].map(e=>e.textContent)); })()`);
check('text.stats', r.value === '["13","5","2","3"]', r.value);

// timestamp
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/timestamp' });
await sleep(500);
r = await evaluate(`(async()=>{
  __set('#ts-in', '1700000000'); __click('[data-act="to-date"]');
  await new Promise(r=>setTimeout(r,120));
  return document.querySelectorAll('[data-val]')[0].textContent + ' | ' + document.querySelectorAll('[data-val]')[2].textContent;
})()`);
check('timestamp.convert', /2023/.test(r.value) && r.value.includes('1700000000'), r.value);

// password
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/password' });
await sleep(500);
r = await evaluate(`(()=>{ const p=document.querySelector('#pw-out').textContent; return p.length + '|' + document.querySelector('#pw-len').textContent; })()`);
check('password.length', r.value.startsWith('20|'), r.value);

// base64
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/base64' });
await sleep(500);
r = await evaluate(`(async()=>{ __set('#cd-in','粒子 hello'); __click('[data-act="encode"]'); await new Promise(r=>setTimeout(r,80)); const enc=document.querySelector('#cd-out').textContent; __set('#cd-in', enc); __click('[data-act="decode"]'); await new Promise(r=>setTimeout(r,80)); return enc + ' => ' + document.querySelector('#cd-out').textContent; })()`);
check('base64.roundtrip', r.value.includes('=> 粒子 hello'), r.value);

// url
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/url' });
await sleep(500);
r = await evaluate(`(async()=>{ __set('#cd-in','粒子 工作台'); __click('[data-act="encode"]'); await new Promise(r=>setTimeout(r,80)); const enc=document.querySelector('#cd-out').textContent; __set('#cd-in', enc); __click('[data-act="decode"]'); await new Promise(r=>setTimeout(r,80)); return enc + ' => ' + document.querySelector('#cd-out').textContent; })()`);
check('url.roundtrip', r.value.includes('=> 粒子 工作台'), r.value);

// uuid
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/uuid' });
await sleep(500);
r = await evaluate(`(()=>{ const t=document.querySelector('#uuid-out').textContent.trim().split('\\n'); return t.length + '|' + /^[0-9a-f-]{36}$/.test(t[0]); })()`);
check('uuid.format', r.value === '8|true', r.value);

// hash
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/hash' });
await sleep(700);
r = await evaluate(`(async()=>{ __set('#hash-in','abc'); await new Promise(r=>setTimeout(r,400)); return document.querySelector('#hash-out').textContent; })()`);
check('hash.sha256', r.value === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', r.value);

// color
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/color' });
await sleep(500);
r = await evaluate(`(async()=>{ __set('#hex-in','#ff0000'); await new Promise(r=>setTimeout(r,100)); return document.querySelector('#v-rgb').textContent + ' | ' + document.querySelector('#v-hsl').textContent; })()`);
check('color.convert', r.value === 'rgb(255, 0, 0) | hsl(0, 100%, 50%)', r.value);

// unit
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/unit' });
await sleep(500);
r = await evaluate(`(async()=>{ __set('#unit-value','1'); const f=document.querySelector('#unit-from'); f.value='km'; f.dispatchEvent(new Event('change',{bubbles:true})); const t=document.querySelector('#unit-to'); t.value='m'; t.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,80)); return document.querySelector('#unit-out').textContent; })()`);
check('unit.km-to-m', r.value === '1000', r.value);

// calc
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/calc' });
await sleep(500);
r = await evaluate(`(async()=>{ __set('#calc-expr','2 ^ 10'); await new Promise(r=>setTimeout(r,80)); const a=document.querySelector('#calc-result').textContent; __set('#calc-expr','17 % 5'); await new Promise(r=>setTimeout(r,80)); return a + '|' + document.querySelector('#calc-result').textContent; })()`);
check('calc.expr', r.value === '1024|2', r.value);

// timer
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools/timer' });
await sleep(500);
r = await evaluate(`(async()=>{ const before=document.querySelector('#timer-digits').textContent; document.querySelector('[data-act="toggle"]').click(); await new Promise(r=>setTimeout(r,1600)); const after=document.querySelector('#timer-digits').textContent; const state=document.querySelector('#timer-state').textContent; document.querySelector('[data-act="toggle"]').click(); return before + ' -> ' + after + ' (' + state + ')'; })()`);
check('timer.countdown', r.value.includes('24:5') || r.value.includes('24:59') || r.value.includes('24:58'), r.value);

// palette
r = await evaluate(`(async()=>{ const ev=new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}); document.dispatchEvent(ev); await new Promise(r=>setTimeout(r,200)); const open=!document.querySelector('#palette').hidden; const input=document.querySelector('#paletteInput'); input.value='json'; input.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,100)); const rows=document.querySelectorAll('.palette-item').length; document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return open + '|' + rows; })()`);
check('palette.search', /^true\|[1-9]/.test(r.value), r.value);

// theme toggle
r = await evaluate(`(async()=>{ const before=document.documentElement.getAttribute('data-theme'); document.querySelector('#themeToggle').click(); await new Promise(r=>setTimeout(r,150)); return before + '->' + document.documentElement.getAttribute('data-theme'); })()`);
check('theme.toggle', /dark->light|light->dark/.test(r.value), r.value);

// about page
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/about' });
await sleep(900);
r = await evaluate(`JSON.stringify({ repos: document.querySelectorAll('.repo-item').length, gh: !!document.querySelector('a[href="https://github.com/wlixill"]') })`);
{
  const v = JSON.parse(r.value || '{}');
  check('about.repos', v.repos >= 4 && v.gh, r.value);
}

// blog pages
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/posts' });
await sleep(700);
r = await evaluate(`JSON.stringify({ rows: document.querySelectorAll('.post-row').length, tags: document.querySelectorAll('.tag-filter .filter-chip').length })`);
{
  const v = JSON.parse(r.value || '{}');
  check('blog.archive', v.rows === 8 && v.tags > 5, r.value);
}

await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/post/cuda-slower' });
await sleep(900);
r = await evaluate(`JSON.stringify({ h1: document.querySelector('.post-head h1')?.textContent || '', h2: document.querySelectorAll('.post-body h2').length, table: document.querySelectorAll('.table-wrap table').length, code: document.querySelectorAll('.code-block').length })`);
{
  const v = JSON.parse(r.value || '{}');
  check('blog.post', v.h1.includes('CUDA') && v.h2 >= 4 && v.table === 1, r.value);
}

await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/tools' });
await sleep(700);
r = await evaluate(`document.querySelectorAll('[data-tool]').length`);
check('tools.grid', r.value === 13, `tiles=${r.value}`);

// legacy deep link redirect
await send('Page.navigate', { url: 'http://127.0.0.1:4321/#/json' });
await sleep(900);
r = await evaluate(`location.hash + '|' + (document.querySelector('#json-in') ? 'mounted' : 'missing')`);
check('legacy.redirect', r.value === '#/tools/json|mounted', r.value);

// mojibake scan on each tool page
const routes = ['tools/json', 'tools/text', 'tools/timestamp', 'tools/password', 'tools/base64', 'tools/url', 'tools/uuid', 'tools/hash', 'tools/color', 'tools/unit', 'tools/calc', 'tools/timer', 'tools/video'];
const bad = [];
for (const route of routes) {
  await send('Page.navigate', { url: `http://127.0.0.1:4321/#/${route}` });
  await sleep(450);
  const res = await evaluate(`(()=>{
    const t = document.body.innerText;
    const m = t.match(/[\\uFFFD]|undefined|NaN|\\[object Object\\]/g);
    return m ? [...new Set(m)].join(',') + ' :: ' + t.slice(0, 60) : '';
  })()`);
  if (res.value) bad.push(`${route}: ${res.value}`);
}
check('pages.mojibake', bad.length === 0, bad.join(' || ') || 'clean');
check('console.errors', errors.length === 0, errors.slice(0, 5).join(' || ') || 'none');

console.log(JSON.stringify(results, null, 1));
const failed = Object.entries(results).filter(([, v]) => !v.ok);
console.log(failed.length ? `FAILED ${failed.length}` : 'ALL PASS');
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
process.exit(failed.length ? 1 : 0);
