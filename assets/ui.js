/* Small DOM + UX helpers shared by the shell and the tools. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, wait = 140) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/* ---------- toasts ---------- */
const toastRoot = () => document.getElementById('toasts');

export function toast(message, type = 'ok') {
  const root = toastRoot();
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast${type === 'err' ? ' err' : ''}`;
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    type === 'err' ? '<path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>' : '<path d="m5 12.5 4.5 4.5L19 7"/>'
  }</svg><span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 1900);
}

/* ---------- clipboard ---------- */
export async function copyText(text, label = '已复制') {
  if (!text) {
    toast('没有可复制的内容', 'err');
    return false;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(label);
    return true;
  } catch {
    toast('复制失败，请手动选择', 'err');
    return false;
  }
}

/* Wire every [data-copy="..."] button inside a root to copy a value or a getter. */
export function bindCopyButtons(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn || !root.contains(btn)) return;
    const key = btn.getAttribute('data-copy');
    const value = root.__copyValues?.[key];
    copyText(typeof value === 'function' ? value() : value, btn.getAttribute('data-copy-label') || '已复制');
  });
}

/* ---------- JSON highlighting ---------- */
export function highlightJson(text) {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    if (m[1]) {
      out += `<span class="${m[2] ? 'tok-key' : 'tok-str'}">${esc(m[1])}</span>${m[2] ? esc(m[2]) : ''}`;
    } else if (m[3]) {
      out += `<span class="${m[3] === 'null' ? 'tok-null' : 'tok-bool'}">${m[3]}</span>`;
    } else if (m[4]) {
      out += `<span class="tok-num">${m[4]}</span>`;
    }
    last = re.lastIndex;
  }
  return out + esc(text.slice(last));
}

/* ---------- misc ---------- */
export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export function relTime(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}
