// Blog/SEO/accessibility regression checks. Start the local HTTP server and Chrome CDP first.
// BLOG_URL=http://127.0.0.1:4321 CDP_PORT=9333 node dev/test-blog.mjs
const base = (process.env.BLOG_URL || 'http://127.0.0.1:4321').replace(/\/$/, '');
const port = process.env.CDP_PORT || 9333;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });

const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
if (!targetResponse.ok) throw new Error(`Chrome CDP target failed: ${targetResponse.status}`);
const target = await targetResponse.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const browserErrors = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.method === 'Runtime.exceptionThrown') {
    browserErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(path, delay = 900) {
  await send('Page.navigate', { url: `${base}${path}` });
  await pause(delay);
}
async function press(key, code, keyCode) {
  const params = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  const articleResponse = await fetch(`${base}/posts/depth-mask-alignment/`);
  const articleHtml = await articleResponse.text();
  check('static.article.http', articleResponse.status === 200, `HTTP ${articleResponse.status}`);
  check('static.article.body', articleHtml.includes('没对齐的深度图') && articleHtml.includes('透视除法'), 'title and body in initial HTML');
  check('static.article.metadata', /rel="canonical"[^>]+posts\/depth-mask-alignment\//.test(articleHtml) && /property="og:description"/.test(articleHtml), 'canonical and Open Graph');
  const sitemapResponse = await fetch(`${base}/sitemap.xml`);
  const sitemap = await sitemapResponse.text();
  check('static.sitemap', sitemapResponse.ok && sitemap.includes('/posts/depth-mask-alignment/'), `HTTP ${sitemapResponse.status}`);
  const robotsResponse = await fetch(`${base}/robots.txt`);
  const robots = await robotsResponse.text();
  check('static.robots', robotsResponse.ok && /sitemap\.xml/i.test(robots), `HTTP ${robotsResponse.status}`);

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate('/posts/depth-mask-alignment/');
  let state = await evaluate(`({h1:document.querySelector('main h1')?.textContent || '', body:document.querySelector('main')?.innerText || ''})`);
  check('static.no-javascript', state.h1.includes('深度图') && state.body.includes('透视除法'), state.h1);
  await send('Emulation.setScriptExecutionDisabled', { value: false });

  await navigate('/#/post/cuda-slower', 1400);
  state = await evaluate(`({path:location.pathname,h1:document.querySelector('.post-head h1')?.textContent || '', description:document.querySelector('meta[name="description"]')?.content || ''})`);
  check('routes.legacy-article', state.path.includes('/posts/cuda-slower/') && state.h1.includes('CUDA'), JSON.stringify(state));
  check('routes.article-description', state.description.includes('RTX 4060'), state.description);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 420 });
  await pause(150);
  state = await evaluate(`(()=>{const p=document.querySelector('.liquid-pointer');return {visible:p?.classList.contains('is-visible'),pointerEvents:p&&getComputedStyle(p).pointerEvents};})()`);
  check('glass.static-article', state.visible && state.pointerEvents === 'none', JSON.stringify(state));

  await navigate('/#/', 900);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 420 });
  await pause(350);
  state = await evaluate(`(()=>{const p=document.querySelector('.liquid-pointer');const r=p?.getBoundingClientRect();return {visible:p?.classList.contains('is-visible'),pointerEvents:p&&getComputedStyle(p).pointerEvents,cx:r&&r.left+r.width/2,cy:r&&r.top+r.height/2};})()`);
  check('glass.mouse-follows', state.visible && state.pointerEvents === 'none' && Math.abs(state.cx - 760) < 2 && Math.abs(state.cy - 420) < 2, JSON.stringify(state));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 760, y: 420, button: 'left', clickCount: 1 });
  state = await evaluate(`document.querySelector('.liquid-pointer')?.classList.contains('is-pressed')`);
  check('glass.click-squash', state === true);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 760, y: 420, button: 'left', clickCount: 1 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await pause(100);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 });
  state = await evaluate(`!document.querySelector('.liquid-pointer')`);
  check('glass.reduced-motion', state === true);

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await navigate('/#/');
  await evaluate(`localStorage.removeItem('pd-bg')`);
  await navigate('/#/', 900);
  // A same-document hash navigation does not reload the page; reload to test default preferences.
  await send('Page.reload');
  await pause(900);
  state = await evaluate(`(()=>{const v=document.querySelector('#backdropVideo');return {loaded:v?.dataset.loaded||'', src:v?.currentSrc||'', bg:document.documentElement.dataset.bg,overflow:document.documentElement.scrollWidth>innerWidth,featured:document.querySelectorAll('.featured-article').length};})()`);
  check('mobile.poster-default', !state.loaded && !state.src && state.bg === 'on', JSON.stringify(state));
  check('mobile.no-overflow', !state.overflow, JSON.stringify(state));
  check('home.featured', state.featured >= 2, `featured=${state.featured}`);

  await evaluate(`document.querySelector('.skip-link').focus()`);
  await press('Tab', 'Tab', 9);
  state = await evaluate(`({id:document.activeElement?.id,insideRail:document.querySelector('#rail')?.contains(document.activeElement),inert:document.querySelector('#rail')?.inert})`);
  check('mobile.closed-drawer-inert', !state.insideRail && state.inert, JSON.stringify(state));
  await evaluate(`document.querySelector('#menuBtn').click()`);
  state = await evaluate(`({open:document.querySelector('#menuBtn').getAttribute('aria-expanded'),insideRail:document.querySelector('#rail').contains(document.activeElement)})`);
  check('mobile.drawer-focus', state.open === 'true' && state.insideRail, JSON.stringify(state));
  await evaluate(`(()=>{const rail=document.querySelector('#rail');const items=[...rail.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);items.at(-1).focus();})()`);
  await press('Tab', 'Tab', 9);
  state = await evaluate(`({insideRail:document.querySelector('#rail').contains(document.activeElement),className:document.activeElement.className})`);
  check('mobile.drawer-focus-wrap', state.insideRail && state.className === 'brand', JSON.stringify(state));
  await press('Escape', 'Escape', 27);
  state = await evaluate(`({open:document.querySelector('#menuBtn').getAttribute('aria-expanded'),focus:document.activeElement?.id})`);
  check('mobile.drawer-escape', state.open === 'false' && state.focus === 'menuBtn', JSON.stringify(state));

  await evaluate(`document.querySelector('#mobileSearch').click();const input=document.querySelector('#paletteInput');input.value='ffprobe';input.dispatchEvent(new Event('input',{bubbles:true}));`);
  state = await evaluate(`({label:document.querySelector('#mobileSearch').getAttribute('aria-label'),results:document.querySelector('#paletteList').innerText})`);
  check('search.full-text', state.results.includes('从一个丑首页') && state.label.includes('文章'), JSON.stringify(state));
  await press('Escape', 'Escape', 27);
  await navigate('/#/posts');
  state = await evaluate(`(()=>{const more=document.querySelector('.tag-more');return {more:!!more,open:more?.open,shown:[...document.querySelectorAll('.tag-filter a')].filter(e=>e.checkVisibility ? e.checkVisibility() : !e.closest('details:not([open])')).length,rows:document.querySelectorAll('.post-row').length};})()`);
  check('archive.collapsed-tags', state.more && !state.open && state.shown <= 8 && state.rows >= 8, JSON.stringify(state));
  await evaluate(`document.querySelector('.tag-more summary').click()`);
  state = await evaluate(`({open:document.querySelector('.tag-more').open,shown:[...document.querySelectorAll('.tag-filter a')].filter(e=>e.checkVisibility ? e.checkVisibility() : !e.closest('details:not([open])')).length})`);
  check('archive.expand-tags', state.open && state.shown > 8, JSON.stringify(state));

  check('browser.exceptions', browserErrors.length === 0, browserErrors.join(' | ') || 'none');
} catch (error) {
  check('test.unexpected-error', false, String(error.stack || error));
} finally {
  try { await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); } catch { /* Chrome may have already exited. */ }
  ws.close();
}
for (const result of checks) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
const failed = checks.filter((result) => !result.pass);
console.log(failed.length ? `FAILED ${failed.length}/${checks.length}` : `ALL PASS (${checks.length})`);
if (failed.length) process.exitCode = 1;
