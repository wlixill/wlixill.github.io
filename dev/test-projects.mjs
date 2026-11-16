// Project gallery regressions against the real site and Chrome DevTools Protocol.
// Start the local HTTP server and Chrome first, then run:
// BLOG_URL=http://127.0.0.1:4321 CDP_PORT=9333 node dev/test-projects.mjs
const base = (process.env.BLOG_URL || 'http://127.0.0.1:4321').replace(/\/$/, '');
const port = process.env.CDP_PORT || 9333;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const browserErrors = [];
const check = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })]).finally(() => clearTimeout(timer));
};

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
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.method === 'Runtime.exceptionThrown') {
    browserErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    browserErrors.push(msg.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
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
async function waitFor(expression, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* A fresh document can replace the execution context. */ }
    await pause(40);
  }
  return false;
}
let navigationId = 0;
async function fresh(hash) {
  // A unique query ensures a new document, not merely a same-document hash change.
  await send('Page.navigate', { url: `${base}/?__project_test=${Date.now()}-${++navigationId}${hash}` });
  return waitFor(`document.querySelector('.project-gallery')`);
}
async function press(key, code, keyCode, modifiers = 0) {
  const params = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
  // Chromium needs the character payload to generate keypress and native
  // button activation; a bare Enter keyDown/Up only dispatches DOM key events.
  const character = key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {};
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...character });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function clickVisible(selector) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, width: r.width, height: r.height, hit: Boolean(hit && (hit === el || el.contains(hit))) };
  })()`);
  if (point?.hit) await clickAt(point.x, point.y);
  return point;
}
function projectHash(name) {
  return name == null ? '#/projects' : `#/projects/${encodeURIComponent(name)}`;
}
async function galleryState() {
  return evaluate(`(() => {
    const gallery = document.querySelector('.project-gallery');
    const cards = [...(gallery?.querySelectorAll('[data-project-open]') || [])];
    const visible = cards.filter((card) => !card.closest('[hidden]'));
    const filters = [...(gallery?.querySelectorAll('[data-project-filter]') || [])];
    const count = gallery?.querySelector('[data-project-count]')?.textContent.trim() || '';
    const empty = gallery?.querySelector('[data-project-empty]');
    const active = document.activeElement;
    return {
      hash: location.hash,
      present: !!gallery,
      names: cards.map((card) => card.getAttribute('data-project-open')),
      namesInText: cards.map((card) => card.textContent.includes(card.getAttribute('data-project-open'))),
      visible: visible.map((card) => card.getAttribute('data-project-open')),
      filters: filters.map((button) => ({ value: button.getAttribute('data-project-filter'), pressed: button.getAttribute('aria-pressed') })),
      count,
      emptyVisible: !!empty && !empty.hidden,
      emptyText: empty?.textContent.trim() || '',
      focusCard: active?.getAttribute('data-project-open') || '',
      focusFilter: active?.getAttribute('data-project-filter') || '',
    };
  })()`);
}
async function detailState() {
  return evaluate(`(() => {
    const dialog = document.querySelector('.project-dialog');
    const link = dialog?.querySelector('[data-project-link]') || dialog?.querySelector('a[href]');
    const active = document.activeElement;
    let slug = '';
    try { if (location.hash.startsWith('#/projects/')) slug = decodeURIComponent(location.hash.slice('#/projects/'.length)); } catch { /* Report malformed hashes below. */ }
    return {
      hash: location.hash, slug,
      open: !!dialog?.open,
      role: dialog?.getAttribute('role') || '',
      modal: dialog?.getAttribute('aria-modal') || '',
      labelledBy: dialog?.getAttribute('aria-labelledby') || '',
      title: dialog?.querySelector('#project-dialog-title')?.textContent.trim() || '',
      description: dialog?.querySelector('#project-dialog-description')?.textContent.trim() || '',
      href: link?.href || '', linkVisible: !!link && !link.hidden && link.hasAttribute('href'),
      linkTarget: link?.getAttribute('target') || '', linkRel: link?.getAttribute('rel') || '',
      previousDisabled: !!dialog?.querySelector('[data-project-prev]')?.disabled,
      nextDisabled: !!dialog?.querySelector('[data-project-next]')?.disabled,
      focusInside: !!dialog?.contains(active),
      focus: active?.hasAttribute('data-project-next') ? 'next' : active?.hasAttribute('data-project-prev') ? 'prev' : active?.hasAttribute('data-project-close') ? 'close' : active?.hasAttribute('data-project-link') ? 'link' : active?.tagName || '',
    };
  })()`);
}
async function focusAndOpen(name) {
  return evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-project-open]')].find((item) => item.getAttribute('data-project-open') === ${JSON.stringify(name)});
    if (!card || card.closest('[hidden]')) return false;
    card.focus();
    card.click();
    return true;
  })()`);
}
async function waitForDetail(name) {
  return waitFor(`location.hash === ${JSON.stringify(projectHash(name))} && document.querySelector('.project-dialog')?.open && document.querySelector('#project-dialog-title')?.textContent.trim() === ${JSON.stringify(name)}`);
}
async function waitForGallery() {
  return waitFor(`location.hash === '#/projects' && document.querySelector('.project-gallery') && !document.querySelector('.project-dialog')?.open`);
}
function countMatches(text, visible, total) {
  const numbers = (text.match(/\d+/g) || []).map(Number);
  return numbers.length >= 2 && numbers[0] === visible && numbers[1] === total;
}
function detailMatches(state, repo) {
  let url = '';
  try { url = new URL(repo.url).href; } catch { /* Invalid real data must fail the assertion. */ }
  return state.open && state.slug === repo.name && state.title === repo.name && state.linkVisible && state.href === url;
}

// Fail exactly the first repository request, then restore the network and retry
// in the same document so a cached rejected/empty promise cannot mask the bug.
async function checkRepoRetry(names) {
  let requestId = null;
  let fulfilled = false;
  let fetchEnabled = false;
  let repoRequests = 0;
  let resolveServed;
  const served = new Promise((resolve) => { resolveServed = resolve; });
  const onMessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Network.requestWillBeSent' && /\/content\/repos\.json(?:[?#]|$)/.test(msg.params.request.url)) {
      repoRequests += 1;
    }
    if (msg.method !== 'Fetch.requestPaused' || !/\/content\/repos\.json(?:[?#]|$)/.test(msg.params.request.url)) return;
    if (requestId) {
      send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
      return;
    }
    requestId = msg.params.requestId;
    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 503,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from('{"error":"temporarily unavailable"}').toString('base64'),
    }).then(() => { fulfilled = true; resolveServed({ ok: true, status: 503 }); }).catch((error) => resolveServed({ ok: false, error: String(error) }));
  };
  ws.addEventListener('message', onMessage);
  try {
    await send('Fetch.enable', { patterns: [{ urlPattern: '*content/repos.json*', requestStage: 'Request' }] });
    fetchEnabled = true;
    await send('Page.navigate', { url: `${base}/?__project_retry=${Date.now()}-${++navigationId}#/projects` });
    const intercepted = await withTimeout(served, 4000);
    check('retry.intercepted-first-503', Boolean(intercepted?.ok), JSON.stringify(intercepted));
    const failureReady = await waitFor(`document.querySelector('[data-retry-route]')`);
    const failure = await evaluate(`(() => {
      const view = document.querySelector('#view');
      const retry = view?.querySelector('[data-retry-route]');
      const rect = retry?.getBoundingClientRect();
      const style = retry ? getComputedStyle(retry) : null;
      return {
        hash: location.hash,
        text: view?.innerText.trim() || '',
        retryText: retry?.textContent.trim() || retry?.getAttribute('aria-label') || '',
        retryVisible: Boolean(retry && rect?.width && rect?.height && style.display !== 'none' && style.visibility !== 'hidden' && !retry.disabled),
        cards: view?.querySelectorAll('[data-project-open]').length || 0,
      };
    })()`);
    check('retry.503-shows-error-not-empty', failureReady && failure.hash === '#/projects' && /(失败|错误|异常|不可用|无法|稍后再试)/.test(failure.text) && !failure.text.includes('暂无项目') && failure.cards === 0 && failure.retryVisible && failure.retryText.includes('重试'), JSON.stringify(failure));

    await send('Fetch.disable'); // Subsequent fetches reach the real local server.
    fetchEnabled = false;
    const beforeRetryRequests = repoRequests;
    const marker = `retry-${Date.now()}`;
    const clicked = await evaluate(`(() => {
      document.documentElement.dataset.projectRetryProbe = ${JSON.stringify(marker)};
      const retry = document.querySelector('[data-retry-route]');
      if (!retry) return false;
      retry.click();
      return true;
    })()`);
    const recovered = await waitFor(`document.querySelectorAll('.project-gallery [data-project-open]').length === ${names.length}`);
    const gallery = await galleryState();
    const sameDocument = await evaluate(`document.documentElement.dataset.projectRetryProbe === ${JSON.stringify(marker)}`);
    check('retry.refetches-in-same-document', clicked && sameDocument && repoRequests > beforeRetryRequests, JSON.stringify({ clicked, sameDocument, beforeRetryRequests, afterRetryRequests: repoRequests }));
    check('retry.restores-real-projects', clicked && recovered && gallery.hash === '#/projects' && same(gallery.names, names) && same(gallery.visible, names) && countMatches(gallery.count, names.length, names.length), JSON.stringify(gallery));
  } finally {
    if (requestId && !fulfilled) {
      try { await send('Fetch.continueRequest', { requestId }); } catch { /* It may already be canceled or fulfilled. */ }
    }
    if (fetchEnabled) {
      try { await send('Fetch.disable'); } catch { /* Fetch may already be disabled. */ }
    }
    ws.removeEventListener('message', onMessage);
  }
}

async function checkEmptyRepos() {
  let requestId = null;
  let fulfilled = false;
  let resolveServed;
  const served = new Promise((resolve) => { resolveServed = resolve; });
  const onMessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method !== 'Fetch.requestPaused' || !/\/content\/repos\.json(?:[?#]|$)/.test(msg.params.request.url)) return;
    requestId = msg.params.requestId;
    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from('[]').toString('base64'),
    }).then(() => { fulfilled = true; resolveServed({ ok: true }); }).catch((error) => resolveServed({ ok: false, error: String(error) }));
  };
  ws.addEventListener('message', onMessage);
  try {
    await send('Fetch.enable', { patterns: [{ urlPattern: '*content/repos.json*', requestStage: 'Request' }] });
    const loaded = await fresh('#/projects');
    const intercepted = await withTimeout(served, 4000);
    check('empty.intercepted', Boolean(intercepted?.ok), JSON.stringify(intercepted));
    await waitFor(`document.querySelector('.project-gallery [data-project-empty]:not([hidden])')`);
    const gallery = await galleryState();
    check('empty.gallery-fallback', loaded && gallery.present && gallery.names.length === 0 && gallery.visible.length === 0 && countMatches(gallery.count, 0, 0) && gallery.emptyVisible && gallery.emptyText.includes('暂无项目') && gallery.filters.some((item) => item.value === 'all' && item.pressed === 'true'), JSON.stringify(gallery));
    await evaluate(`location.hash = '#/projects/__missing_empty__'`);
    await waitFor(`document.querySelector('.project-dialog')?.open && document.querySelector('#project-dialog-title')?.textContent.trim() === '项目未找到'`);
    const detail = await detailState();
    check('empty.missing-detail-fallback', detail.open && detail.slug === '__missing_empty__' && detail.title === '项目未找到' && !detail.linkVisible && detail.previousDisabled && detail.nextDisabled, JSON.stringify(detail));
    await press('Escape', 'Escape', 27);
    await waitForGallery();
    const closed = await galleryState();
    check('empty.close-returns-to-gallery', closed.hash === '#/projects' && closed.present && closed.focusFilter === 'all', JSON.stringify(closed));
  } finally {
    if (requestId && !fulfilled) {
      try { await send('Fetch.continueRequest', { requestId }); } catch { /* It may already be canceled or fulfilled. */ }
    }
    try { await send('Fetch.disable'); } catch { /* Fetch may not have been enabled. */ }
    ws.removeEventListener('message', onMessage);
  }
}

try {
  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  const response = await fetch(`${base}/content/repos.json`, { cache: 'no-store' });
  const raw = await response.json();
  const repos = Array.isArray(raw) ? raw.filter((repo) => repo && typeof repo.name === 'string' && repo.name.length > 0).map((repo) => ({
    name: repo.name,
    language: typeof repo.lang === 'string' && repo.lang.trim() ? repo.lang.trim() : '未标注语言',
    url: typeof repo.url === 'string' ? repo.url : '',
  })) : [];
  check('data.real-repos', response.ok && Array.isArray(raw) && repos.length >= 2, `HTTP ${response.status}, usable=${repos.length}`);
  if (repos.length < 2) throw new Error('At least two real repositories are needed to check previous and next.');
  const names = repos.map((repo) => repo.name);
  const languages = [...new Set(repos.map((repo) => repo.language))];

  const loaded = await fresh('#/projects');
  let gallery = await galleryState();
  check('gallery.real-cards-and-count', loaded && gallery.hash === '#/projects' && same(gallery.names, names) && same(gallery.visible, names) && gallery.namesInText.every(Boolean) && countMatches(gallery.count, names.length, names.length), JSON.stringify(gallery));
  check('gallery.language-options', same(gallery.filters.map((item) => item.value), ['all', ...languages]) && gallery.filters[0]?.pressed === 'true', JSON.stringify(gallery.filters));

  const categoryAnimation = await evaluate(`(() => {
    const button = document.querySelectorAll('[data-project-filter]')[1];
    button?.click();
    const card = document.querySelector('.project-grid__item:not([hidden])');
    const style = card && getComputedStyle(card);
    return { name: style?.animationName || '', duration: style?.animationDuration || '', selected: button?.getAttribute('aria-pressed') };
  })()`);
  check('filter.visible-grid-transition', categoryAnimation.name === 'project-grid-in' && parseFloat(categoryAnimation.duration) > 0 && categoryAnimation.selected === 'true', JSON.stringify(categoryAnimation));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reducedCategory = await evaluate(`(() => {
    const button = document.querySelector('[data-project-filter="all"]');
    button?.click();
    const card = document.querySelector('.project-grid__item:not([hidden])');
    return { name: card && getComputedStyle(card).animationName, selected: button?.getAttribute('aria-pressed') };
  })()`);
  check('filter.reduced-motion-selection', reducedCategory.name === 'none' && reducedCategory.selected === 'true', JSON.stringify(reducedCategory));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  for (const language of languages) {
    const clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('[data-project-filter]')].find((item) => item.getAttribute('data-project-filter') === ${JSON.stringify(language)});
      if (!button) return false;
      button.click();
      return true;
    })()`);
    gallery = await galleryState();
    const expected = repos.filter((repo) => repo.language === language).map((repo) => repo.name);
    const pressed = gallery.filters.filter((item) => item.pressed === 'true');
    check(`filter.${language}`, clicked && same(gallery.visible, expected) && countMatches(gallery.count, expected.length, names.length) && pressed.length === 1 && pressed[0].value === language, JSON.stringify(gallery));
  }
  await evaluate(`document.querySelector('[data-project-filter="all"]')?.click()`);
  gallery = await galleryState();
  check('filter.reset-all', same(gallery.visible, names) && countMatches(gallery.count, names.length, names.length) && gallery.filters[0]?.pressed === 'true', JSON.stringify(gallery));

  const opened = await focusAndOpen(repos[0].name);
  const openedInTime = await waitForDetail(repos[0].name);
  let detail = await detailState();
  check('dialog.card-opens-correct-repo', opened && openedInTime && detailMatches(detail, repos[0]) && detail.role === 'dialog' && detail.modal === 'true' && detail.labelledBy === 'project-dialog-title' && detail.focusInside && detail.linkTarget === '_blank' && /(?:^|\s)noopener(?:\s|$)/.test(detail.linkRel), JSON.stringify(detail));
  const beforeNext = detail;

  await evaluate(`document.querySelector('[data-project-next]')?.focus()`);
  await press('Enter', 'Enter', 13);
  await waitForDetail(repos[1].name);
  detail = await detailState();
  check('switch.next-real-title-link-and-focus', detailMatches(beforeNext, repos[0]) && detailMatches(detail, repos[1]) && detail.title !== beforeNext.title && detail.href !== beforeNext.href && detail.focus === 'next', JSON.stringify({ before: beforeNext, after: detail }));
  const beforePrevious = detail;
  await evaluate(`document.querySelector('[data-project-prev]')?.focus()`);
  await press('Enter', 'Enter', 13);
  await waitForDetail(repos[0].name);
  detail = await detailState();
  check('switch.previous-real-title-link-and-focus', detailMatches(beforePrevious, repos[1]) && detailMatches(detail, repos[0]) && detail.title !== beforePrevious.title && detail.href !== beforePrevious.href && detail.focus === 'prev', JSON.stringify({ before: beforePrevious, after: detail }));

  await evaluate(`document.querySelector('[data-project-close]')?.focus()`);
  const trail = [];
  for (let i = 0; i < 8; i += 1) {
    await press('Tab', 'Tab', 9);
    trail.push(await detailState());
  }
  check('dialog.tab-never-escapes', trail.every((item) => item.open && item.focusInside), JSON.stringify(trail.map((item) => item.focus)));
  await evaluate(`document.querySelector('[data-project-close]')?.focus()`);
  await press('Tab', 'Tab', 9, 8); // Shift+Tab wraps from first to last.
  const backwards = await detailState();
  await press('Tab', 'Tab', 9);
  const forwards = await detailState();
  check('dialog.tab-wrap-both-directions', backwards.focus === 'next' && forwards.focus === 'close' && backwards.focusInside && forwards.focusInside, JSON.stringify({ backwards, forwards }));

  await press('Escape', 'Escape', 27);
  await waitForGallery();
  gallery = await galleryState();
  check('dialog.escape-restores-card-focus', gallery.hash === '#/projects' && gallery.present && gallery.focusCard === repos[0].name, JSON.stringify(gallery));

  await focusAndOpen(repos[1].name);
  await waitForDetail(repos[1].name);
  const maskPoint = await evaluate(`(() => {
    const dialog = document.querySelector('.project-dialog');
    const points = [[2, 2], [innerWidth - 3, 2], [2, innerHeight - 3], [innerWidth - 3, innerHeight - 3]];
    const point = points.find(([x, y]) => document.elementFromPoint(x, y) === dialog);
    return point ? { x: point[0], y: point[1] } : null;
  })()`);
  check('dialog.mask-hit-target', Boolean(maskPoint), JSON.stringify(maskPoint));
  if (maskPoint) await clickAt(maskPoint.x, maskPoint.y);
  else await evaluate(`document.querySelector('[data-project-close]')?.click()`); // Keep later checks independent.
  await waitForGallery();
  gallery = await galleryState();
  check('dialog.mask-restores-card-focus', Boolean(maskPoint) && gallery.hash === '#/projects' && gallery.present && gallery.focusCard === repos[1].name, JSON.stringify(gallery));

  await focusAndOpen(repos[0].name);
  await waitForDetail(repos[0].name);
  await evaluate(`document.querySelector('[data-project-next]')?.focus()`);
  await press('Enter', 'Enter', 13);
  const nextReady = await waitForDetail(repos[1].name);
  check('history.precondition-next', nextReady, JSON.stringify(await detailState()));
  await evaluate(`history.back()`);
  await waitForDetail(repos[0].name);
  detail = await detailState();
  check('history.back-restores-previous-project', detailMatches(detail, repos[0]) && detail.focus === 'next', JSON.stringify(detail));
  await evaluate(`history.back()`);
  await waitForGallery();
  gallery = await galleryState();
  check('history.back-closes-and-restores-focus', gallery.hash === '#/projects' && gallery.focusCard === repos[0].name, JSON.stringify(gallery));

  const direct = repos[repos.length - 1];
  await fresh(projectHash(direct.name));
  await waitForDetail(direct.name);
  detail = await detailState();
  check('route.direct-project', detailMatches(detail, direct) && detail.focusInside, JSON.stringify(detail));
  await send('Page.reload');
  await waitForDetail(direct.name);
  detail = await detailState();
  check('route.reload-project', detailMatches(detail, direct) && detail.focusInside, JSON.stringify(detail));
  await press('Escape', 'Escape', 27);
  await waitForGallery();
  gallery = await galleryState();
  check('route.direct-close-restores-card', gallery.hash === '#/projects' && gallery.focusCard === direct.name, JSON.stringify(gallery));

  const missing = `missing-project-${Date.now()}`;
  await fresh(projectHash(missing));
  await waitFor(`document.querySelector('.project-dialog')?.open && document.querySelector('#project-dialog-title')?.textContent.trim() === '项目未找到'`);
  detail = await detailState();
  check('route.invalid-slug-fallback', detail.open && detail.slug === missing && detail.title === '项目未找到' && detail.description.includes(missing) && !detail.linkVisible && !detail.previousDisabled && !detail.nextDisabled, JSON.stringify(detail));
  await press('Escape', 'Escape', 27);
  await waitForGallery();
  gallery = await galleryState();
  check('route.invalid-close-returns-gallery', gallery.hash === '#/projects' && gallery.present && names.includes(gallery.focusCard), JSON.stringify(gallery));

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await fresh('#/projects');
  let dimensions = await evaluate(`(() => { const gallery = document.querySelector('.project-gallery'); return { width: document.documentElement.clientWidth, innerWidth, visualWidth: visualViewport.width, root: document.documentElement.scrollWidth, body: document.body.scrollWidth, gallery: gallery?.scrollWidth || 0, galleryClient: gallery?.clientWidth || 0 }; })()`);
  check('mobile.gallery-no-horizontal-overflow', dimensions.root <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1 && dimensions.gallery <= dimensions.galleryClient + 1, JSON.stringify(dimensions));
  const mobileCard = await clickVisible('[data-project-open]');
  const mobileOpened = await waitForDetail(repos[0].name);
  detail = await detailState();
  check('mobile.card-opens', Boolean(mobileCard?.hit) && mobileOpened && detailMatches(detail, repos[0]), JSON.stringify({ point: mobileCard, detail }));
  dimensions = await evaluate(`(() => { const dialog = document.querySelector('.project-dialog'); return { width: document.documentElement.clientWidth, innerWidth, visualWidth: visualViewport.width, root: document.documentElement.scrollWidth, body: document.body.scrollWidth, dialog: dialog?.scrollWidth || 0, dialogClient: dialog?.clientWidth || 0 }; })()`);
  check('mobile.dialog-no-horizontal-overflow', dimensions.root <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1 && dimensions.dialogClient <= dimensions.width + 1 && dimensions.dialog <= dimensions.dialogClient + 1, JSON.stringify(dimensions));
  const mobileClose = await clickVisible('[data-project-close]');
  await waitForGallery();
  gallery = await galleryState();
  check('mobile.dialog-close', Boolean(mobileClose?.hit) && gallery.hash === '#/projects' && gallery.present, JSON.stringify({ point: mobileClose, gallery }));

  // A fresh deep link starts at the top of the gallery; the last card is below
  // the fold, so closing the dialog must bring the restored focus into view.
  await fresh(projectHash(direct.name));
  const mobileDirectOpened = await waitForDetail(direct.name);
  const mobileDirectClose = await clickVisible('[data-project-close]');
  const mobileDirectClosed = await waitForGallery();
  const mobileFocus = await evaluate(`(() => {
    const card = document.activeElement;
    const rect = card?.getBoundingClientRect();
    const viewport = window.visualViewport;
    return {
      card: card?.getAttribute('data-project-open') || '',
      rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      viewport: { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0, width: viewport?.width || document.documentElement.clientWidth, height: viewport?.height || innerHeight },
      scrollY: window.scrollY,
    };
  })()`);
  const rect = mobileFocus.rect;
  const viewport = mobileFocus.viewport;
  const focusCenterVisible = rect && rect.width > 0 && rect.height > 0 && rect.left + rect.width / 2 >= viewport.left && rect.left + rect.width / 2 <= viewport.left + viewport.width && rect.top + rect.height / 2 >= viewport.top && rect.top + rect.height / 2 <= viewport.top + viewport.height;
  check('mobile.direct-close-focus-visible', mobileDirectOpened && Boolean(mobileDirectClose?.hit) && mobileDirectClosed && mobileFocus.card === direct.name && focusCenterVisible, JSON.stringify({ close: mobileDirectClose, focus: mobileFocus }));
  await send('Emulation.clearDeviceMetricsOverride');

  await checkRepoRetry(names);
  await checkEmptyRepos();
} catch (error) {
  check('test.unexpected-error', false, String(error.stack || error));
} finally {
  check('browser.exceptions', browserErrors.length === 0, browserErrors.join(' | ') || 'none');
  try { await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); } catch { /* Chrome may already have exited. */ }
  ws.close();
}
for (const result of checks) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
const failed = checks.filter((result) => !result.pass);
console.log(failed.length ? `FAILED ${failed.length}/${checks.length}` : `ALL PASS (${checks.length})`);
if (failed.length) process.exitCode = 1;
