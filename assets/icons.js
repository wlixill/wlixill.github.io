/* Minimal stroke icon set (24×24, lucide-flavoured). */
const P = {
  film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  braces: '<path d="M8 4H7a3 3 0 0 0-3 3v2.5a2.5 2.5 0 0 1-1 2 2.5 2.5 0 0 1 1 2V17a3 3 0 0 0 3 3h1"/><path d="M16 4h1a3 3 0 0 1 3 3v2.5a2.5 2.5 0 0 0 1 2 2.5 2.5 0 0 0-1 2V17a3 3 0 0 1-3 3h-1"/>',
  text: '<path d="M4 6h16M4 12h11M4 18h15"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l2.8 1.8"/>',
  key: '<circle cx="8" cy="15" r="3.6"/><path d="m10.6 12.4 6.6-6.6M15.4 7.6l1.8 1.8M18 5l1.8 1.8"/>',
  code: '<path d="m8.5 9-4 3 4 3M15.5 9l4 3-4 3"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7L11.7 6.6"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.4-1.4"/>',
  fingerprint: '<path d="M4.5 9a9 9 0 0 1 15 0"/><path d="M6.8 12.5a7 7 0 0 1 10.4 0"/><path d="M9 15.8a4 4 0 0 1 6 0"/><path d="M11.2 19h1.6"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8.5 20M15.5 4 14 20"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.9 0-1.6-1.6-1.9-1.6-3.4 0-1 .8-1.7 1.9-1.7h2.1c2 0 3.6-1.6 3.6-3.6C20.5 6 16.8 3.5 12 3.5Z"/><circle cx="8" cy="9" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="9.4" r=".9" fill="currentColor" stroke="none"/>',
  ruler: '<path d="M4.5 14.5 14.5 4.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L9.5 19.5a2 2 0 0 1-2.8 0l-2.2-2.2a2 2 0 0 1 0-2.8Z"/><path d="m8.5 10.5 1.8 1.8M11.5 7.5l1.8 1.8M5.5 13.5l1.8 1.8"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7"/><path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>',
  timer: '<path d="M9.5 3h5"/><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.8v3.9h2.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M6.5 15H5.8A1.8 1.8 0 0 1 4 13.2V5.8A1.8 1.8 0 0 1 5.8 4h7.4A1.8 1.8 0 0 1 15 5.8v.7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  download: '<path d="M12 4v11M7.5 10.8 12 15.3l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 15.5V4.5M7.5 8.7 12 4.2l4.5 4.5"/><path d="M4.5 19.5h15"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/>',
  sparkles: '<path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8 12 3.5Z"/><path d="M18.5 15.5l.7 1.9 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.9Z"/>',
  shield: '<path d="M12 3 4.8 5.8v5.6c0 4.3 2.9 8.1 7.2 9.3 4.3-1.2 7.2-5 7.2-9.3V5.8L12 3Z"/><path d="m9.2 12 2 2 3.6-4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.2a1.8 1.8 0 0 0 1.8 1.6h5.8a1.8 1.8 0 0 0 1.8-1.6L17.5 7"/>',
  videoFile: '<path d="M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5l-6-6Z"/><path d="M13.5 3.5V10h6"/><path d="m10.5 12.5 4 2.3-4 2.3v-4.6Z"/>',
  backspace: '<path d="M9 5h9.5A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5H9L3 12l6-7Z"/><path d="m11.8 9.6 4.8 4.8M16.6 9.6l-4.8 4.8"/>',
  github: 'FILL:<path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/>',
  house: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z"/><path d="M9.5 20.5v-6h5v6"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.9-3.5 3.7-5.6 7.2-5.6s6.3 2.1 7.2 5.6"/>',
  play: '<path d="m8.5 5.5 10 6.5-10 6.5v-13Z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5V9h4.5"/>',
  swap: '<path d="M7 4v13M4 14l3 3 3-3"/><path d="M17 20V7M14 10l3-3 3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  equal: '<path d="M5 9h14M5 15h14"/>',
  clockSmall: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.6"/>',
  moon: '<path d="M20.5 14.2A8.3 8.3 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  alert: '<path d="M12 4.5 21 19.5H3L12 4.5Z"/><path d="M12 10v4M12 17h.01"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4"/>',
};

export function icon(name, cls = '') {
  let d = P[name];
  if (!d) return '';
  const filled = d.startsWith('FILL:');
  if (filled) d = d.slice(5);
  const paint = filled
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" ${paint} aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
}

export const ICON_NAMES = Object.keys(P);
