/* Decorative liquid-glass pointer. It never replaces the system cursor or receives clicks. */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const forcedColors = matchMedia('(forced-colors: active)');

let pointer = null;
let frame = 0;
let previousTime = 0;
let hasPosition = false;
let x = 0;
let y = 0;
let targetX = 0;
let targetY = 0;
let angle = 0;
let selecting = false;
let refractionMap;

// Encode an independent, radial displacement field in R/G. The centre stays
// neutral; only a narrow bevel bends the backdrop toward the lens centre.
// This is progressive enhancement: CSS provides a regular blur if it fails.
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
      const t = Math.max(0, Math.min(1, (radius - 0.72) / 0.28));
      const bevel = t * t * (3 - 2 * t);
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
        <feDisplacementMap in="SourceGraphic" in2="glass-field" scale="0.22" xChannelSelector="R" yChannelSelector="G" />
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
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
  hasPosition = false;
  selecting = false;
  pointer?.classList.remove('is-visible', 'is-pressed', 'is-interactive', 'is-editing', 'is-selecting');
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

function draw(time) {
  if (!pointer || !hasPosition) {
    frame = 0;
    return;
  }
  const elapsed = previousTime ? Math.min(time - previousTime, 48) : 16;
  previousTime = time;
  const easing = 1 - Math.exp(-elapsed / 38);
  const dx = targetX - x;
  const dy = targetY - y;
  x += dx * easing;
  y += dy * easing;
  let distance = Math.hypot(targetX - x, targetY - y);
  // Keep the native cursor inside the lens even during fast movements.
  if (distance > 12) {
    x = targetX - (targetX - x) * 12 / distance;
    y = targetY - (targetY - y) * 12 / distance;
    distance = 12;
  }
  if (distance > 0.5) angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const stretch = 1 + Math.min(distance / 200, 0.06);
  const squash = 1 / Math.sqrt(stretch);
  pointer.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`;
  pointer.style.setProperty('--lens-angle', `${angle.toFixed(1)}deg`);
  pointer.style.setProperty('--lens-inverse-angle', `${(-angle).toFixed(1)}deg`);
  pointer.style.setProperty('--lens-stretch', stretch.toFixed(3));
  pointer.style.setProperty('--lens-squash', squash.toFixed(3));
  if (distance > 0.25) frame = requestAnimationFrame(draw);
  else {
    frame = 0;
    previousTime = 0;
  }
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
  const interactive = Boolean(element?.closest('a, button, summary, [role="button"], label'));
  pointer.classList.toggle('is-editing', editing);
  pointer.classList.toggle('is-interactive', interactive);
  targetX = event.clientX;
  targetY = event.clientY;
  if (!hasPosition) {
    x = targetX;
    y = targetY;
    hasPosition = true;
    pointer.classList.add('is-visible');
  }
  if (!frame) frame = requestAnimationFrame(draw);
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
