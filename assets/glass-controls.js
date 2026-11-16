/* A moving glass selection, progressively enhanced with edge refraction.
   Native links and buttons remain the only interactive elements. */
const groupsSelector = '#toolNav > .nav-group:first-child, .filter-row, .tag-filter, .seg, .format-group';
const glareSelector = '.featured-article, .post-card, .tile, .project-card, .project-teaser';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const forcedColors = matchMedia('(forced-colors: active)');
const states = new WeakMap();
const queued = new Set();
const fieldCache = new Map();
let frame = 0;
let nextId = 0;
let svgDefs;
let tagSnapshot = null;

function getDefs() {
  if (svgDefs) return svgDefs;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.append(svgDefs);
  document.body.append(svg);
  return svgDefs;
}

// Rounded-rectangle normals instead of a stretched circular field: the long
// edges bend vertically and the corners bend toward the capsule centre.
function capsuleField(width, height) {
  const aspect = Math.max(1, Math.round((width / height) * 16) / 16);
  const key = String(aspect);
  if (fieldCache.has(key)) return fieldCache.get(key);
  const w = 192;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const image = context.createImageData(w, h);
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const x = ((px + 0.5) / w - 0.5) * aspect;
      const y = (py + 0.5) / h - 0.5;
      const cornerX = Math.max(Math.abs(x) - (aspect - 1) / 2, 0);
      const radius = Math.hypot(cornerX, y);
      const t = Math.max(0, Math.min(1, (radius - 0.34) / 0.16));
      const bevel = t * t * (3 - 2 * t);
      const nx = radius ? Math.sign(x) * cornerX / radius : 0;
      const ny = radius ? y / radius : 0;
      const offset = (py * w + px) * 4;
      // SVG scales X relative to width and Y relative to height; compensate
      // so the horizontal and vertical bend have comparable physical size.
      image.data[offset] = Math.round(127.5 - 127.5 * nx * bevel / aspect);
      image.data[offset + 1] = Math.round(127.5 - 127.5 * ny * bevel);
      image.data[offset + 2] = 128;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const field = canvas.toDataURL('image/png');
  if (fieldCache.size >= 64) fieldCache.delete(fieldCache.keys().next().value);
  fieldCache.set(key, field);
  return field;
}

function makeFilter(indicator) {
  const ns = 'http://www.w3.org/2000/svg';
  const filter = document.createElementNS(ns, 'filter');
  const id = `liquid-switch-refraction-${++nextId}`;
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', '100%');
  filter.setAttribute('height', '100%');
  filter.setAttribute('primitiveUnits', 'objectBoundingBox');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const image = document.createElementNS(ns, 'feImage');
  image.setAttribute('x', '0');
  image.setAttribute('y', '0');
  image.setAttribute('width', '1');
  image.setAttribute('height', '1');
  image.setAttribute('preserveAspectRatio', 'none');
  image.setAttribute('result', 'capsule-field');
  const displacement = document.createElementNS(ns, 'feDisplacementMap');
  displacement.setAttribute('in', 'SourceGraphic');
  displacement.setAttribute('in2', 'capsule-field');
  displacement.setAttribute('scale', '0.18');
  displacement.setAttribute('xChannelSelector', 'R');
  displacement.setAttribute('yChannelSelector', 'G');
  filter.append(image, displacement);
  getDefs().append(filter);
  indicator.style.setProperty('--liquid-refraction', `url("#${id}")`);
  return { filter, image };
}

function activeItem(group) {
  if (group.matches('.format-group')) {
    return group.querySelector('.format-grid .fmt[aria-pressed="true"]');
  }
  return [...group.children].find((child) =>
    child.matches('[aria-current="page"], button[aria-pressed="true"]')
  );
}

function queue(group) {
  if (!group?.isConnected || !states.has(group)) return;
  queued.add(group);
  if (!frame) frame = requestAnimationFrame(flush);
}

function update(group) {
  const state = states.get(group);
  if (!state || !group.isConnected) return;
  const item = activeItem(group);
  if (!item) {
    state.indicator.classList.remove('is-positioned');
    group.classList.remove('has-liquid-selection');
    state.item = null;
    return;
  }
  const parent = group.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = rect.left - parent.left + group.scrollLeft - group.clientLeft;
  const y = rect.top - parent.top + group.scrollTop - group.clientTop;
  const indicator = state.indicator;
  const moved = state.item && state.item !== item;
  indicator.style.width = `${rect.width.toFixed(2)}px`;
  indicator.style.height = `${rect.height.toFixed(2)}px`;
  indicator.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
  if (!state.ready) {
    state.ready = true;
    requestAnimationFrame(() => {
      if (!group.isConnected || !states.has(group)) return;
      indicator.classList.add('is-positioned');
      group.classList.add('has-liquid-selection');
    });
  } else {
    indicator.classList.add('is-positioned');
    group.classList.add('has-liquid-selection');
  }
  if (moved && !reduceMotion.matches && !forcedColors.matches) {
    indicator.classList.remove('is-moving');
    void indicator.offsetWidth;
    indicator.classList.add('is-moving');
  }
  state.item = item;
  state.geometry = { x, y, width: rect.width, height: rect.height };
  const fieldKey = Math.round(rect.width / rect.height * 16);
  if (state.fieldKey !== fieldKey) {
    try {
      const field = capsuleField(rect.width, rect.height);
      if (field) {
        if (!state.filter) Object.assign(state, makeFilter(indicator));
        state.image.setAttribute('href', field);
        indicator.classList.add('has-refraction');
      }
    } catch { /* Canvas or SVG may be unavailable; retain the glass blur. */ }
    state.fieldKey = fieldKey;
  }
}

function flush() {
  frame = 0;
  const groups = [...queued];
  queued.clear();
  groups.forEach(update);
}

const resizeObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => entries.forEach((entry) => queue(entry.target)))
  : null;

function setup(group) {
  if (states.has(group)) return;
  const indicator = document.createElement('span');
  indicator.className = 'liquid-selection';
  indicator.setAttribute('aria-hidden', 'true');
  group.prepend(indicator);
  const state = { indicator, item: null, ready: false, fieldKey: null };
  if (group.matches('.tag-filter') && tagSnapshot && performance.now() - tagSnapshot.time < 1500) {
    const { x, y, width, height } = tagSnapshot;
    indicator.style.width = `${width.toFixed(2)}px`;
    indicator.style.height = `${height.toFixed(2)}px`;
    indicator.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    indicator.classList.add('is-positioned');
    group.classList.add('has-liquid-selection');
    void indicator.offsetWidth;
    state.ready = true;
    tagSnapshot = null;
  }
  states.set(group, state);
  resizeObserver?.observe(group);
  queue(group);
}

function visit(node, callback) {
  if (!(node instanceof Element)) return;
  if (node.matches(groupsSelector)) callback(node);
  node.querySelectorAll(groupsSelector).forEach(callback);
}

function dispose(group) {
  if (group.isConnected) return;
  const state = states.get(group);
  if (!state) return;
  if (group.matches('.tag-filter') && state.geometry && /^#\/posts(?:\/|$)/.test(location.hash)) {
    tagSnapshot = { ...state.geometry, time: performance.now() };
  }
  resizeObserver?.unobserve(group);
  state.filter?.remove();
  queued.delete(group);
  states.delete(group);
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === 'attributes') {
      queue(record.target.closest(groupsSelector));
      continue;
    }
    record.removedNodes.forEach((node) => visit(node, dispose));
    record.addedNodes.forEach((node) => visit(node, setup));
  }
});
observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'aria-pressed'] });
visit(document.body, setup);
window.addEventListener('resize', () => document.querySelectorAll(groupsSelector).forEach(queue), { passive: true });
document.fonts?.ready.then(() => document.querySelectorAll(groupsSelector).forEach(queue));

// A small, local highlight follows the mouse across actual glass surfaces.
let glareFrame = 0;
let glareTarget = null;
let glareX = 0;
let glareY = 0;
document.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse' || reduceMotion.matches || forcedColors.matches) return;
  const element = event.target instanceof Element ? event.target.closest(glareSelector) : null;
  if (!element) return;
  glareTarget = element;
  glareX = event.clientX;
  glareY = event.clientY;
  if (glareFrame) return;
  glareFrame = requestAnimationFrame(() => {
    glareFrame = 0;
    if (!glareTarget?.isConnected) return;
    const rect = glareTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(100, (glareX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (glareY - rect.top) / rect.height * 100));
    glareTarget.style.setProperty('--glass-x', `${x.toFixed(1)}%`);
    glareTarget.style.setProperty('--glass-y', `${y.toFixed(1)}%`);
  });
}, { passive: true });
