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

function makePointer() {
  const el = document.createElement('div');
  el.className = 'liquid-pointer';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
      <filter id="liquid-pointer-refraction" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.026" numOctaves="2" seed="7" result="ripples" />
        <feDisplacementMap in="SourceGraphic" in2="ripples" scale="4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <span class="liquid-pointer__lens"></span>`;
  document.body.append(el);
  return el;
}

function hidePointer() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
  hasPosition = false;
  pointer?.classList.remove('is-visible', 'is-pressed', 'is-interactive', 'is-editing');
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
  const easing = 1 - Math.exp(-elapsed / 72);
  const dx = targetX - x;
  const dy = targetY - y;
  x += dx * easing;
  y += dy * easing;
  const distance = Math.hypot(targetX - x, targetY - y);
  if (distance > 0.5) angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const stretch = 1 + Math.min(distance / 420, 0.17);
  const squash = 1 / Math.sqrt(stretch);
  pointer.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`;
  pointer.style.setProperty('--lens-angle', `${angle.toFixed(1)}deg`);
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
  if (event.pointerType !== 'mouse' || reducedMotion.matches || forcedColors.matches) return;
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
  if (pointer && event.pointerType === 'mouse' && hasPosition) pointer.classList.add('is-pressed');
}, { passive: true });
document.addEventListener('pointerup', () => pointer?.classList.remove('is-pressed'), { passive: true });
document.addEventListener('pointercancel', hidePointer, { passive: true });
document.documentElement.addEventListener('pointerleave', hidePointer, { passive: true });
window.addEventListener('blur', hidePointer);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hidePointer();
});
