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

async function glassState() {
  return evaluate(`(() => {
    const p = document.querySelector('.liquid-pointer');
    const hit = document.elementFromPoint(760, 420);
    const events = window.__glassTest || {};
    return {
      visible: Boolean(p?.classList.contains('is-visible') && getComputedStyle(p).display !== 'none'),
      pointerEvents: p ? getComputedStyle(p).pointerEvents : '',
      target: hit?.id || '',
      cursor: hit ? getComputedStyle(hit).cursor : '',
      bodyCursor: getComputedStyle(document.body).cursor,
      rootCursor: getComputedStyle(document.documentElement).cursor,
      clicks: events.clicks || 0,
      lastMove: events.moves?.at(-1) || '',
      lastDown: events.downs?.at(-1) || '',
      forcedColors: matchMedia('(forced-colors: active)').matches,
    };
  })()`);
}

// Run in the page: sample real rendered geometry across animation frames, not
// just transition declarations or an aria attribute that could change instantly.
async function selectionSampler(scopeSelector, targetSelector, durationMs) {
  const scope = document.querySelector(scopeSelector);
  const indicator = scope?.querySelector('.liquid-selection');
  const source = scope?.querySelector('[aria-current="page"], [aria-pressed="true"]');
  const target = scope?.querySelector(targetSelector);
  if (!scope || !indicator || !source || !target) {
    return { error: 'missing group, indicator, selected item or target', scope: !!scope, indicator: !!indicator, source: !!source, target: !!target };
  }
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
  };
  const before = rect(indicator);
  const sourceRect = rect(source);
  const samples = [];
  target.click();
  await new Promise((resolve) => {
    const start = performance.now();
    let finished = false;
    let timer;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(done, durationMs + 500); // Do not hang if a headless tab stops rendering frames.
    const tick = () => {
      if (finished) return;
      samples.push(rect(indicator));
      if (performance.now() - start >= durationMs) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const after = rect(indicator);
  const destination = rect(target);
  const dx = destination.x - before.x;
  const dy = destination.y - before.y;
  const distanceSquared = dx * dx + dy * dy;
  const intermediate = distanceSquared > 1 && samples.find((r) => {
    const progress = ((r.x - before.x) * dx + (r.y - before.y) * dy) / distanceSquared;
    return progress > 0.04 && progress < 0.96;
  });
  const style = getComputedStyle(indicator);
  const inViewport = destination.x >= 0 && destination.x < innerWidth && destination.y >= 0 && destination.y < innerHeight;
  const hit = inViewport ? document.elementFromPoint(destination.x, destination.y) : null;
  return {
    hasClass: scope.classList.contains('has-liquid-selection'),
    ariaHidden: indicator.getAttribute('aria-hidden'),
    pointerEvents: style.pointerEvents,
    hitTarget: inViewport ? Boolean(hit && (target === hit || target.contains(hit))) : null,
    visible: indicator.isConnected && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0,
    selected: target.matches('[aria-current="page"], [aria-pressed="true"]'),
    selectedCount: scope.querySelectorAll('[aria-current="page"], [aria-pressed="true"]').length,
    before, source: sourceRect, after, destination,
    distance: Math.sqrt(distanceSquared),
    intermediate: intermediate || null,
    frameCount: samples.length,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

async function sampleSelection(scopeSelector, targetSelector, durationMs = 950) {
  return evaluate(`(${selectionSampler})(${JSON.stringify(scopeSelector)}, ${JSON.stringify(targetSelector)}, ${durationMs})`);
}

function checkSelection(name, state, expectMotion = true) {
  const near = (a, b) => Boolean(a && b && Math.hypot(a.x - b.x, a.y - b.y) <= 4);
  const nearSize = (a, b) => Boolean(a && b && b.width > 0 && b.height > 0 && Math.abs(a.width - b.width) <= Math.max(4, b.width * 0.2) && Math.abs(a.height - b.height) <= Math.max(4, b.height * 0.2));
  const report = (suffix, pass) => check(`${name}.${suffix}`, pass, pass ? '' : JSON.stringify(state));
  report('indicator', !state.error && state.hasClass && state.ariaHidden === 'true' && state.pointerEvents === 'none' && state.visible && state.after?.width > 0 && state.after?.height > 0);
  report('initial-position', !state.error && near(state.before, state.source));
  report('initial-size', !state.error && nearSize(state.before, state.source));
  report('selection', !state.error && state.selected && state.selectedCount === 1);
  report('hit-test', !state.error && state.hitTarget !== false);
  report('final-position', !state.error && near(state.after, state.destination));
  report('final-size', !state.error && nearSize(state.after, state.destination));
  if (expectMotion) report('intermediate-frame', !state.error && state.distance > 8 && Boolean(state.intermediate));
  else report('reduced-motion', !state.error && state.reducedMotion && !state.intermediate);
}

async function toolCategoryState() {
  return evaluate(`(() => {
    const tiles = [...document.querySelectorAll('#toolGrid [data-tool]')];
    return {
      hash: location.hash,
      selected: document.querySelector('.filter-row [aria-pressed="true"]')?.getAttribute('data-filter') || '',
      count: document.querySelector('#gridCount')?.textContent.trim() || '',
      tiles: tiles.length,
      categories: tiles.map((tile) => tile.querySelector('.tile-foot span')?.textContent.trim() || ''),
    };
  })()`);
}

// Keep the real repository request pending until a featured article has been
// pressed, then release the response before mouseup. A late home insertion must
// not move the link or steal the real click, on either desktop or mobile.
async function checkHomeLateReposClick(label, mobile) {
  let requestId = null;
  let networkId = null;
  let responseStatus = null;
  let continued = false;
  let fetchEnabled = false;
  let mouseDown = false;
  let point = null;
  let resolvePaused;
  let resolveFinished;
  const paused = new Promise((resolve) => { resolvePaused = resolve; });
  const finished = new Promise((resolve) => { resolveFinished = resolve; });
  const onMessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Fetch.requestPaused' && /\/content\/repos\.json(?:[?#]|$)/.test(msg.params.request.url)) {
      requestId = msg.params.requestId;
      networkId = msg.params.networkId || null;
      resolvePaused(requestId);
    }
    if (networkId && msg.params?.requestId === networkId && msg.method === 'Network.responseReceived') {
      responseStatus = msg.params.response.status;
    }
    if (networkId && msg.params?.requestId === networkId && (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed')) {
      resolveFinished({ ok: msg.method === 'Network.loadingFinished', error: msg.params.errorText || '' });
    }
  };
  ws.addEventListener('message', onMessage);
  try {
    const metrics = mobile
      ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 }
      : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
    await send('Emulation.setDeviceMetricsOverride', metrics);
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*content/repos.json*', requestStage: 'Request' }] });
    fetchEnabled = true;
    await send('Page.navigate', { url: `${base}/?__home_late=${label}-${Date.now()}#/` });
    const held = await Promise.race([paused, pause(4000).then(() => null)]);
    check(`home.${label}.late-repos-intercepted`, Boolean(held), held ? 'repos.json held' : 'no repository request was intercepted');
    if (!held) return;
    const ready = await evaluate(`(async () => {
      const end = performance.now() + 5000;
      while (performance.now() < end) {
        const link = document.querySelector('.featured-article');
        if (link && link.getClientRects().length && getComputedStyle(link).visibility !== 'hidden') return true;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return false;
    })()`);
    check(`home.${label}.featured-while-repos-pending`, ready, ready ? 'featured link rendered with request held' : 'featured link never appeared');
    if (!ready) return;
    await evaluate(`Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 300))]).then(() => true)`);
    await pause(350); // Finish the view entrance animation before measuring.
    const initial = await evaluate(`(() => {
      const link = document.querySelector('.featured-article');
      if (!link) return null;
      link.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = link.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!initial) {
      check(`home.${label}.target-ready`, false, 'featured link disappeared before the press');
      return;
    }
    await pause(100);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: initial.x, y: initial.y, pointerType: 'mouse' });
    await pause(230); // Finish the normal hover transform before measuring.
    const before = await evaluate(`(() => {
      const link = document.querySelector('.featured-article');
      if (!link) return null;
      const probe = window.__homeLateClickProbe = { link, down: null };
      link.addEventListener('mousedown', (event) => { probe.down = { trusted: event.isTrusted, button: event.button, x: event.clientX, y: event.clientY }; }, { once: true });
      const r = link.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { href: link.href, title: link.querySelector('strong')?.textContent.trim() || '', x, y, left: r.left, top: r.top, width: r.width, height: r.height, hit: !!hit && (hit === link || link.contains(hit)), projectCards: document.querySelectorAll('#homeProjectTeasers .project-card').length, projectEntry: !!document.querySelector('a[href="#/projects"]') };
    })()`);
    check(`home.${label}.target-ready`, Boolean(before?.href && before?.title && before?.hit && before.width > 0 && before.height > 0), JSON.stringify(before));
    if (!before?.href || !before?.title || !before?.hit) return;
    point = { x: before.x, y: before.y };
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, pointerType: 'mouse' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
    mouseDown = true;
    const down = await evaluate(`window.__homeLateClickProbe?.down || null`);
    check(`home.${label}.trusted-mouse-down`, Boolean(down?.trusted && down.button === 0), JSON.stringify(down));
    await send('Fetch.continueRequest', { requestId: held });
    continued = true;
    const completion = networkId ? await Promise.race([finished, pause(4000).then(() => null)]) : null;
    let repoCount = 0;
    let responseError = '';
    if (completion?.ok) {
      try {
        const response = await send('Network.getResponseBody', { requestId: networkId });
        const text = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body;
        const repos = JSON.parse(text);
        repoCount = Array.isArray(repos) ? repos.filter((repo) => repo && typeof repo.name === 'string' && repo.name.length > 0).length : 0;
      } catch (error) { responseError = String(error); }
    }
    check(`home.${label}.repos-finished-before-mouseup`, Boolean(completion?.ok && responseStatus === 200 && repoCount > 0), JSON.stringify({ networkId, completion, responseStatus, repoCount, responseError }));
    await pause(300); // Allow response.json(), DOM mutation and a paint to finish.
    const after = await evaluate(`(() => {
      const probe = window.__homeLateClickProbe;
      const link = probe?.link;
      if (!link) return null;
      const r = link.getBoundingClientRect();
      const hit = document.elementFromPoint(${before.x}, ${before.y});
      return { href: link.href, connected: link.isConnected, sameNode: document.querySelector('.featured-article') === link, hit: !!hit && (hit === link || link.contains(hit)), left: r.left, top: r.top, width: r.width, height: r.height, projectCards: document.querySelectorAll('#homeProjectTeasers .project-card').length, projectEntry: !!document.querySelector('a[href="#/projects"]') };
    })()`);
    const stable = after && after.connected && after.sameNode && after.hit && after.href === before.href && Math.abs(after.left - before.left) <= 2 && Math.abs(after.top - before.top) <= 2 && Math.abs(after.width - before.width) <= 2 && Math.abs(after.height - before.height) <= 2;
    check(`home.${label}.pressed-link-position-and-hit-stable`, Boolean(stable), JSON.stringify({ before, after }));
    check(`home.${label}.no-late-project-insertion`, before.projectCards === 0 && after?.projectCards === 0 && before.projectEntry && after?.projectEntry, JSON.stringify({ before, after }));
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
    mouseDown = false;
    let destination = null;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      try {
        const current = await evaluate(`({ href: location.href, title: document.querySelector('.post-head h1')?.textContent.trim() || '' })`);
        if (current.href === before.href && current.title === before.title) { destination = current; break; }
      } catch { /* The old execution context is replaced by the article document. */ }
      await pause(40);
    }
    check(`home.${label}.mouseup-navigates-to-article`, Boolean(destination), JSON.stringify({ expected: { href: before.href, title: before.title }, destination }));
  } finally {
    if (mouseDown && point) {
      try { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' }); } catch { /* Target may already have navigated. */ }
    }
    if (requestId && !continued) {
      try { await send('Fetch.continueRequest', { requestId }); } catch { /* Request may already have been canceled. */ }
    }
    if (fetchEnabled) {
      try { await send('Fetch.disable'); } catch { /* Fetch may already have been disabled. */ }
    }
    ws.removeEventListener('message', onMessage);
  }
}

// Intercept before the fresh about-page navigation: home and about share the
// repo cache, so opening home first could otherwise make this race disappear.
async function checkAboutNavigationRace() {
  let heldRequest = null;
  let heldNetworkId = null;
  let profileNetworkId = null;
  let continued = false;
  let resolvePaused;
  let resolveFinished;
  let resolveProfile;
  const paused = new Promise((resolve) => { resolvePaused = resolve; });
  const finished = new Promise((resolve) => { resolveFinished = resolve; });
  const profileFinished = new Promise((resolve) => { resolveProfile = resolve; });
  const onMessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Network.requestWillBeSent' && /\/content\/profile\.json(?:[?#]|$)/.test(msg.params.request.url)) {
      profileNetworkId = msg.params.requestId;
    }
    if (msg.method === 'Fetch.requestPaused' && /\/content\/repos\.json(?:[?#]|$)/.test(msg.params.request.url)) {
      heldRequest = msg.params.requestId;
      heldNetworkId = msg.params.networkId || null;
      resolvePaused(heldRequest);
    }
    if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
      const result = { ok: msg.method === 'Network.loadingFinished', error: msg.params.errorText || '' };
      if (heldNetworkId && msg.params.requestId === heldNetworkId) resolveFinished(result);
      if (profileNetworkId && msg.params.requestId === profileNetworkId) resolveProfile(result);
    }
  };
  ws.addEventListener('message', onMessage);
  try {
    await send('Fetch.enable', { patterns: [{ urlPattern: '*content/repos.json*', requestStage: 'Request' }] });
    // A unique query forces a new document even when only the hash would change.
    await send('Page.navigate', { url: `${base}/?__about_race=${Date.now()}#/about` });
    const request = await Promise.race([paused, pause(4000).then(() => null)]);
    check('routes.about-race.intercepted', Boolean(request), request ? 'repos.json held before about finished' : 'repos.json was not intercepted');
    if (!request) return;
    const about = await evaluate(`({hash:location.hash,active:document.querySelector('[data-nav="about"]')?.getAttribute('aria-current') || ''})`);
    check('routes.about-race.about-started', about.hash === '#/about' && about.active === 'page', JSON.stringify(about));
    const profile = await Promise.race([profileFinished, pause(3000).then(() => null)]);
    check('routes.about-race.profile-finished', Boolean(profile?.ok), JSON.stringify(profile));
    await evaluate(`document.querySelector('[data-nav="tools"]')?.click()`);
    await pause(300);
    const snapshot = () => evaluate(`({hash:location.hash,title:document.title,heading:document.querySelector('.page-head h1')?.textContent || '',tools:!!document.querySelector('#toolGrid'),active:document.querySelector('[data-nav="tools"]')?.getAttribute('aria-current') || ''})`);
    const before = await snapshot();
    await send('Fetch.continueRequest', { requestId: request });
    continued = true;
    if (heldNetworkId) {
      const completion = await Promise.race([finished, pause(2500).then(() => null)]);
      check('routes.about-race.request-finished', Boolean(completion?.ok), JSON.stringify(completion));
      await pause(150); // Let response.json() and the awaiting render settle.
    } else {
      await pause(700); // Older CDP implementations may omit networkId.
    }
    const after = await snapshot();
    const isTools = (value) => value.hash === '#/tools' && value.title.includes('工具箱') && value.heading === '工具箱' && value.tools && value.active === 'page';
    check('routes.about-race.remains-on-tools', isTools(before) && isTools(after), JSON.stringify({ before, after }));
  } finally {
    if (heldRequest && !continued) {
      try { await send('Fetch.continueRequest', { requestId: heldRequest }); } catch { /* Request may already have been canceled. */ }
    }
    try { await send('Fetch.disable'); } catch { /* Fetch may not have been enabled. */ }
    ws.removeEventListener('message', onMessage);
  }
}

try {
  await send('Page.enable');
  await send('Page.bringToFront'); // Keep animation frames active when Chrome has other tabs.
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

  await checkHomeLateReposClick('desktop', false);
  await checkHomeLateReposClick('mobile', true);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // Desktop navigation and selection controls must actually move between the
  // old and new targets; merely changing aria-current/pressed is insufficient.
  await navigate('/#/', 900);
  state = await sampleSelection('#toolNav .nav-group:first-child', '[data-nav="tools"]');
  checkSelection('selection.nav', state);
  if (state.error) {
    await evaluate(`document.querySelector('[data-nav="tools"]')?.click()`);
    await pause(600);
  }

  const allTools = await toolCategoryState();
  check('category.initial-all', allTools.selected === 'all' && allTools.tiles > 0, JSON.stringify(allTools));
  state = await sampleSelection('.filter-row', '[data-filter="dev"]');
  checkSelection('selection.category', state);
  if (state.error) {
    await evaluate(`document.querySelector('[data-filter="dev"]')?.click()`);
    await pause(300);
  }
  const isDevGrid = (value) => value.hash === '#/tools' && value.selected === 'dev' && value.tiles > 0 && value.tiles < allTools.tiles && value.count === `${value.tiles} 件 / 1 类` && value.categories.every((name) => name === '文本与开发');
  const filtered = await toolCategoryState();
  check('category.filtered-count-and-cards', isDevGrid(filtered), JSON.stringify(filtered));

  const opened = await evaluate(`(() => { const tile = document.querySelector('#toolGrid [data-tool="json"]'); if (!tile) return false; tile.click(); return true; })()`);
  await pause(500);
  state = await evaluate(`({hash:location.hash,mounted:!!document.querySelector('#json-in')})`);
  check('category.open-tool', opened && state.hash === '#/tools/json' && state.mounted, JSON.stringify(state));
  await evaluate(`document.querySelector('.backlink[href="#/tools"]')?.click()`);
  await pause(700);
  const restored = await toolCategoryState();
  check('category.return-preserves-count-and-cards', isDevGrid(restored) && restored.tiles === filtered.tiles, JSON.stringify(restored));
  state = await evaluate(`(() => {
    const group = document.querySelector('.filter-row');
    const marker = group?.querySelector('.liquid-selection');
    const selected = group?.querySelector('[aria-pressed="true"]');
    if (!group || !marker || !selected) return { missing: true };
    const a = marker.getBoundingClientRect();
    const b = selected.getBoundingClientRect();
    return { hasClass: group.classList.contains('has-liquid-selection'), hidden: marker.getAttribute('aria-hidden'), width: a.width, height: a.height, distance: Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2) };
  })()`);
  check('category.return-indicator-position', !state.missing && state.hasClass && state.hidden === 'true' && state.width > 0 && state.height > 0 && state.distance <= 4, JSON.stringify(state));
  await evaluate(`document.querySelector('#toolGrid [data-tool="json"]')?.click()`);
  await pause(400);
  await evaluate(`history.back()`);
  await pause(700);
  const browserBack = await toolCategoryState();
  check('category.history-back-preserves-count-and-cards', isDevGrid(browserBack) && browserBack.tiles === filtered.tiles, JSON.stringify(browserBack));

  await navigate('/#/tools/timestamp', 900);
  state = await sampleSelection('.seg[aria-label="时间戳单位"]', '[data-unit="ms"]');
  checkSelection('selection.timestamp', state);
  if (state.error) await evaluate(`document.querySelector('[data-unit="ms"]')?.click()`);
  state = await evaluate(`(() => {
    const input = document.querySelector('#ts-in');
    if (!input) return { missing: true };
    input.value = '1700000000000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="to-date"]')?.click();
    return { hint: document.querySelector('#ts-unit-hint')?.textContent || '', seconds: document.querySelector('[data-val="2"]')?.textContent || '', milliseconds: document.querySelector('[data-val="3"]')?.textContent || '' };
  })()`);
  check('timestamp.milliseconds-work', Boolean(state.hint?.includes('毫秒')) && state.seconds === '1700000000' && state.milliseconds === '1700000000000', JSON.stringify(state));

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await pause(120);
  state = await sampleSelection('.seg[aria-label="时间戳单位"]', '[data-unit="s"]', 300);
  checkSelection('selection.timestamp-reduced', state, false);
  if (state.error) await evaluate(`document.querySelector('[data-unit="s"]')?.click()`);
  state = await evaluate(`({seconds:document.querySelector('[data-unit="s"]')?.getAttribute('aria-pressed'),milliseconds:document.querySelector('[data-unit="ms"]')?.getAttribute('aria-pressed'),hint:document.querySelector('#ts-unit-hint')?.textContent || ''})`);
  check('timestamp.reduced-selection-works', state.seconds === 'true' && state.milliseconds === 'false' && state.hint.includes('秒'), JSON.stringify(state));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // Video formats are split across two nested grids; switching between them
  // exercises indicator coordinates without loading the conversion engine.
  await navigate('/#/tools/video', 900);
  state = await sampleSelection('.format-group', '[data-fmt="mp3"]');
  checkSelection('selection.video-format', state);
  if (state.error) await evaluate(`document.querySelector('[data-fmt="mp3"]')?.click()`);
  state = await evaluate(`({pressed:document.querySelector('[data-fmt="mp3"]')?.getAttribute('aria-pressed'),hint:document.querySelector('#fmt-hint')?.textContent || '',audioDisabled:document.querySelector('#audio-check')?.disabled})`);
  check('video.format-selection-works', state.pressed === 'true' && state.hint.includes('MP3') && state.audioDisabled === true, JSON.stringify(state));

  await checkAboutNavigationRace();

  // Tag navigation replaces the entire view, so inspect the newly created
  // filter and its selected indicator rather than holding a detached old node.
  await navigate('/#/posts', 900);
  const tagStart = await evaluate(`(() => {
    const filter = document.querySelector('.tag-filter');
    const target = [...(filter?.querySelectorAll(':scope > a.filter-chip') || [])].find((a) => a.getAttribute('aria-current') !== 'page');
    if (!target) return { missing: true };
    const result = { label: target.textContent.trim(), rows: document.querySelectorAll('.post-row').length };
    target.click();
    return result;
  })()`);
  await pause(1000);
  state = await evaluate(`(() => {
    const filter = document.querySelector('.tag-filter');
    const marker = filter?.querySelector('.liquid-selection');
    const selected = filter?.querySelector('[aria-current="page"]');
    let routeTag = '';
    try { if (location.hash.startsWith('#/posts/')) routeTag = decodeURIComponent(location.hash.slice('#/posts/'.length)); } catch { /* Invalid routes fail the assertion below. */ }
    const result = { routeTag, heading: document.querySelector('.page-head h1')?.textContent.trim() || '', selected: selected?.textContent.trim() || '', rows: document.querySelectorAll('.post-row').length, selectedCount: filter?.querySelectorAll('[aria-current="page"]').length || 0 };
    if (!filter || !marker || !selected) return { ...result, missing: true };
    const a = marker.getBoundingClientRect();
    const b = selected.getBoundingClientRect();
    const style = getComputedStyle(marker);
    return { ...result, hasClass: filter.classList.contains('has-liquid-selection'), ariaHidden: marker.getAttribute('aria-hidden'), pointerEvents: style.pointerEvents, visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0, width: a.width, height: a.height, distance: Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2) };
  })()`);
  check('tags.filter-route-and-results', !tagStart.missing && state.routeTag === tagStart.label && state.heading === tagStart.label && state.selected === tagStart.label && state.selectedCount === 1 && state.rows > 0 && state.rows <= tagStart.rows, JSON.stringify({ before: tagStart, after: state }));
  check('tags.filter-indicator-visible', !state.missing && state.hasClass && state.ariaHidden === 'true' && state.pointerEvents === 'none' && state.visible && state.width > 0 && state.height > 0 && state.distance <= 4, JSON.stringify(state));

  await navigate('/#/', 900);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 420 });
  await pause(350);
  state = await evaluate(`(()=>{const p=document.querySelector('.liquid-pointer');const r=p?.getBoundingClientRect();return {visible:p?.classList.contains('is-visible'),pointerEvents:p&&getComputedStyle(p).pointerEvents,cx:r&&r.left+r.width/2,cy:r&&r.top+r.height/2};})()`);
  check('glass.mouse-follows', state.visible && state.pointerEvents === 'none' && Math.abs(state.cx - 760) < 2 && Math.abs(state.cy - 420) < 2, JSON.stringify(state));
  state = await evaluate(`(() => {
    const p = document.querySelector('.liquid-pointer');
    return {
      enabled: !!p?.classList.contains('has-refraction'),
      map: p?.querySelector('feImage')?.getAttribute('href')?.slice(0, 24) || '',
      input: p?.querySelector('feDisplacementMap')?.getAttribute('in2') || '',
    };
  })()`);
  check('glass.refraction-map', state.enabled && state.map.startsWith('data:image/png;base64,') && state.input === 'glass-field', JSON.stringify(state));

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 520 });
  await pause(60);
  state = await evaluate(`(()=>{const r=document.querySelector('.liquid-pointer').getBoundingClientRect();return Math.hypot(r.left+r.width/2-1200,r.top+r.height/2-520)})()`);
  check('glass.fast-pointer-stays-inside', state <= 12.1, `distance=${state.toFixed(2)}px`);

  await evaluate(`(()=>{const input=document.createElement('input');input.id='glass-test-input';input.style.cssText='position:fixed;left:720px;top:310px;width:80px;height:35px;z-index:2147482000';document.body.append(input)})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 325 });
  state = await evaluate(`(async () => {
    const pointer = document.querySelector('.liquid-pointer');
    const deadline = performance.now() + 900;
    let result;
    do {
      result = { editing: pointer.classList.contains('is-editing'), opacity: Number(getComputedStyle(pointer).opacity) };
      if (result.editing && result.opacity < 0.02) return result;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (performance.now() < deadline);
    return result;
  })()`);
  check('glass.editing-hidden', state.editing && state.opacity < 0.02, JSON.stringify(state));
  await evaluate(`document.querySelector('#glass-test-input').remove()`);

  await evaluate(`(()=>{const text=document.createElement('p');text.id='glass-test-selection';text.textContent='Select this text';text.style.cssText='position:fixed;left:700px;top:300px;width:160px;height:50px;z-index:2147482000;user-select:text';document.body.append(text)})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 730, y: 320 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 730, y: 320, button: 'left', clickCount: 1 });
  await evaluate(`(()=>{const node=document.querySelector('#glass-test-selection').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,6);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'))})()`);
  state = await evaluate(`document.querySelector('.liquid-pointer').classList.contains('is-selecting')`);
  check('glass.text-selection-hidden', state === true);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 730, y: 320, button: 'left', clickCount: 1 });
  await evaluate(`window.getSelection().removeAllRanges();document.querySelector('#glass-test-selection').remove()`);

  // Put a real button below the lens. Hit testing and a CDP mouse click must
  // reach it while the browser's regular pointer cursor remains in use.
  await evaluate(`(() => {
    const target = document.createElement('button');
    target.id = 'glass-test-target';
    target.type = 'button';
    target.textContent = 'Glass test';
    target.style.cssText = 'position:fixed;left:720px;top:380px;width:80px;height:80px;z-index:2147482000;cursor:pointer;pointer-events:auto;touch-action:none';
    const events = window.__glassTest = { clicks: 0, moves: [], downs: [] };
    target.addEventListener('pointermove', event => events.moves.push(event.pointerType));
    target.addEventListener('pointerdown', event => events.downs.push(event.pointerType));
    target.addEventListener('click', () => { events.clicks += 1; });
    document.body.append(target);
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 420 });
  state = await glassState();
  check('glass.native-hit-test', state.visible && state.pointerEvents === 'none' && state.target === 'glass-test-target' && state.cursor === 'pointer' && state.bodyCursor !== 'none' && state.rootCursor !== 'none', JSON.stringify(state));

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 760, y: 420, button: 'left', clickCount: 1 });
  state = await evaluate(`document.querySelector('.liquid-pointer')?.classList.contains('is-pressed')`);
  check('glass.click-squash', state === true);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 760, y: 420, button: 'left', clickCount: 1 });
  state = await glassState();
  check('glass.real-mouse-click', state.clicks === 1 && state.lastDown === 'mouse', JSON.stringify(state));

  // Emulate a hybrid device, first verifying that mouse input still works when
  // touch is available. Check state at touchStart, before touchEnd can hide it.
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 761, y: 421, pointerType: 'mouse' });
  state = await glassState();
  check('glass.hybrid-mouse-before-touch', state.visible && state.lastMove === 'mouse', JSON.stringify(state));
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 761, y: 421, id: 1 }] });
  state = await glassState();
  check('glass.touch-hides', !state.visible && state.lastDown === 'touch', JSON.stringify(state));
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 769, y: 429, id: 1 }] });
  state = await glassState();
  check('glass.touch-move-hidden', !state.visible && state.lastMove === 'touch', JSON.stringify(state));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 762, y: 422, pointerType: 'mouse' });
  state = await glassState();
  check('glass.mouse-restores-after-touch', state.visible && state.lastMove === 'mouse', JSON.stringify(state));

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 763, y: 423, pointerType: 'pen' });
  state = await glassState();
  check('glass.pen-move-hides', !state.visible && state.lastMove === 'pen', JSON.stringify(state));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 764, y: 424, pointerType: 'mouse' });
  state = await glassState();
  check('glass.mouse-restores-after-pen', state.visible && state.lastMove === 'mouse', JSON.stringify(state));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 765, y: 425, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
  state = await glassState();
  check('glass.pen-down-hides', !state.visible && state.lastDown === 'pen', JSON.stringify(state));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 765, y: 425, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 766, y: 426, pointerType: 'mouse' });
  state = await glassState();
  check('glass.mouse-restores-after-pen-down', state.visible && state.lastMove === 'mouse', JSON.stringify(state));

  // Exercise the window blur listener without depending on headless OS focus.
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  state = await glassState();
  check('glass.blur-hides', !state.visible, JSON.stringify(state));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 767, y: 427, pointerType: 'mouse' });
  state = await glassState();
  check('glass.mouse-restores-after-blur', state.visible && state.lastMove === 'mouse', JSON.stringify(state));

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'forced-colors', value: 'active' }] });
  await pause(100);
  state = await glassState();
  check('glass.forced-colors-hides', state.forcedColors && !state.visible, JSON.stringify(state));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 768, y: 428, pointerType: 'mouse' });
  state = await glassState();
  check('glass.forced-colors-stays-hidden', state.forcedColors && !state.visible, JSON.stringify(state));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'forced-colors', value: 'none' }] });
  await pause(100);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 769, y: 429, pointerType: 'mouse' });
  state = await glassState();
  check('glass.mouse-restores-after-forced-colors', !state.forcedColors && state.visible && state.lastMove === 'mouse', JSON.stringify(state));
  await evaluate(`document.querySelector('#glass-test-target')?.remove(); delete window.__glassTest`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await pause(100);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 });
  state = await evaluate(`(() => { const p = document.querySelector('.liquid-pointer'); return !p || getComputedStyle(p).display === 'none'; })()`);
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

  // Selecting inside the closing, transformed drawer must not leave the
  // indicator measured in the wrong coordinate space when it is reopened.
  await evaluate(`document.querySelector('#menuBtn').click()`);
  await pause(300);
  await evaluate(`document.querySelector('[data-nav="tools"]')?.click()`);
  await pause(450);
  state = await evaluate(`({open:document.querySelector('#menuBtn').getAttribute('aria-expanded'),hash:location.hash})`);
  check('mobile.drawer-nav-closes', state.open === 'false' && state.hash === '#/tools', JSON.stringify(state));
  await evaluate(`document.querySelector('#menuBtn').click()`);
  await pause(700); // Keep the original post-transition check before retrying.
  state = await evaluate(`(async () => {
    const deadline = performance.now() + 2000;
    let result;
    do {
      const group = document.querySelector('#toolNav .nav-group:first-child');
      const marker = group?.querySelector('.liquid-selection');
      const selected = group?.querySelector('[aria-current="page"]');
      if (!group || !marker || !selected) result = { missing: true };
      else {
        const a = marker.getBoundingClientRect();
        const b = selected.getBoundingClientRect();
        result = { open: document.querySelector('#menuBtn').getAttribute('aria-expanded'), selected: selected.getAttribute('data-nav'), hasClass: group.classList.contains('has-liquid-selection'), hidden: marker.getAttribute('aria-hidden'), width: a.width, height: a.height, distance: Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2) };
        if (result.open === 'true' && result.selected === 'tools' && result.hasClass && result.hidden === 'true' && result.width > 0 && result.height > 0 && result.distance <= 4) return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    } while (performance.now() < deadline);
    return result;
  })()`);
  check('mobile.drawer-reopen-indicator', !state.missing && state.open === 'true' && state.selected === 'tools' && state.hasClass && state.hidden === 'true' && state.width > 0 && state.height > 0 && state.distance <= 4, JSON.stringify(state));
  await evaluate(`document.querySelector('#railClose').click()`);

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
