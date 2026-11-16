import './glass-controls.js?v=20261116-2';

/* Decorative liquid-glass pointer. It never replaces the system cursor or receives clicks. */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const forcedColors = matchMedia('(forced-colors: active)');

let pointer = null;
let hasPosition = false;
let selecting = false;
let refractionMap;

// Encode a radial displacement field in R/G. Both the centre and the outer
// edge stay neutral, so the slight refraction feathers into the backdrop.
// This is progressive enhancement: CSS provides a soft highlight if it fails.
function makeRefractionMap() {
  if (refractionMap) return refractionMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const image = context.createImageData(size, size);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const nx = (px + 0.5 - size / 2) / (size / 2);
      const ny = (py + 0.5 - size / 2) / (size / 2);
      const radius = Math.hypot(nx, ny);
      const inner = Math.max(0, Math.min(1, (radius - 0.48) / 0.30));
      const outer = Math.max(0, Math.min(1, (radius - 0.79) / 0.21));
      const smoothInner = inner * inner * (3 - 2 * inner);
      const smoothOuter = outer * outer * (3 - 2 * outer);
      const bevel = smoothInner * (1 - smoothOuter);
      const direction = radius > 0 ? bevel / radius : 0;
      const offset = (py * size + px) * 4;
      image.data[offset] = Math.round(127.5 - 127.5 * nx * direction);
      image.data[offset + 1] = Math.round(127.5 - 127.5 * ny * direction);
      image.data[offset + 2] = 128;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  refractionMap = canvas.toDataURL('image/png');
  return refractionMap;
}

function makePointer() {
  const el = document.createElement('div');
  el.className = 'liquid-pointer';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
      <filter id="liquid-pointer-refraction" x="0" y="0" width="100%" height="100%"
        primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
        <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="glass-field" />
        <feDisplacementMap in="SourceGraphic" in2="glass-field" scale="0.10" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <span class="liquid-pointer__morph"><span class="liquid-pointer__lens"></span></span>`;
  try {
    const field = makeRefractionMap();
    if (field) {
      el.querySelector('feImage').setAttribute('href', field);
      el.classList.add('has-refraction');
    }
  } catch { /* Canvas can be unavailable; retain the blur-only glass. */ }
  document.body.append(el);
  return el;
}

function hidePointer() {
  hasPosition = false;
  selecting = false;
  pointer?.classList.remove('is-visible', 'is-pressed', 'is-editing', 'is-selecting');
}

function syncPreference() {
  if ((reducedMotion.matches || forcedColors.matches) && pointer) {
    hidePointer();
    pointer.remove();
    pointer = null;
  }
}

for (const preference of [reducedMotion, forcedColors]) {
  if (preference.addEventListener) preference.addEventListener('change', syncPreference);
  else preference.addListener(syncPreference);
}

function onMove(event) {
  // A real mouse event is a more reliable signal than media queries on hybrid devices.
  // Touch and stylus input never create the decorative element.
  if (event.pointerType !== 'mouse') {
    hidePointer();
    return;
  }
  if (reducedMotion.matches || forcedColors.matches) return;
  if (!pointer) pointer = makePointer();
  const element = event.target instanceof Element ? event.target : null;
  const editing = Boolean(element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
  pointer.classList.toggle('is-editing', editing);
  // Position in the pointer event itself so the effect is centred under the
  // native cursor on the next paint, with no artificial spring or trailing.
  pointer.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
  if (!hasPosition) {
    hasPosition = true;
    pointer.classList.add('is-visible');
  }
}

document.addEventListener('pointermove', onMove, { passive: true });
document.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse') {
    hidePointer();
    return;
  }
  if (event.button !== 0 || !pointer || !hasPosition) return;
  selecting = true;
  pointer.classList.add('is-pressed');
}, { passive: true });
document.addEventListener('pointerup', (event) => {
  if (event.pointerType !== 'mouse') return;
  selecting = false;
  pointer?.classList.remove('is-pressed', 'is-selecting');
}, { passive: true });
document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (selecting && selection && !selection.isCollapsed) pointer?.classList.add('is-selecting');
});
document.addEventListener('pointercancel', hidePointer, { passive: true });
document.documentElement.addEventListener('pointerleave', hidePointer, { passive: true });
window.addEventListener('blur', hidePointer);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hidePointer();
});
