/* ==========================================================================
   Tiny Markdown renderer — 只覆盖本站文章用到的语法子集。
   支持：front matter、标题、段落、代码块、列表、引用、表格、分割线、
   行内代码 / 粗体 / 斜体 / 链接 / 图片。
   ========================================================================== */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function parseFrontMatter(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: text };
  const head = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n+/, '');
  const data = {};
  head.split('\n').forEach((line) => {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) return;
    const key = m[1];
    let value = m[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, '');
    }
    data[key] = value;
  });
  return { data, body };
}

/* ---------- inline ---------- */
function inline(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  s = esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const ext = /^https?:\/\//.test(href);
      return `<a href="${href}"${ext ? ' target="_blank" rel="noreferrer"' : ''}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s（(])\*([^*\n]+)\*(?=[\s）)，。！？:：;；]|$)/g, '$1<em>$2</em>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

/* ---------- blocks ---------- */
export function renderMarkdown(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let i = 0;
  let headingId = 0;

  const isBlank = (l) => !l.trim();
  const isTableStart = (idx) => /^\s*\|/.test(lines[idx] || '') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[idx + 1] || '');

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    /* fenced code */
    const fence = /^```([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || 'text';
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      out.push(
        `<div class="code-block"><div class="code-block-head"><span>${esc(lang)}</span><button type="button" data-copy-code>复制</button></div><pre><code>${esc(
          buf.join('\n')
        )}</code></pre></div>`
      );
      continue;
    }

    /* heading */
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const id = `h-${++headingId}`;
      if (level === 2 || level === 3) headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    /* horizontal rule */
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }

    /* blockquote */
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }

    /* table */
    if (isTableStart(i)) {
      const header = lines[i].split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        `<div class="table-wrap"><table><thead><tr>${header
          .map((c) => `<th>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }

    /* lists */
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }

    /* paragraph */
    const buf = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i]) &&
      !isTableStart(i)
    ) {
      buf.push(lines[i++]);
    }
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    else i++;
  }

  return { html: out.join('\n'), headings };
}

export function readingTime(md) {
  const chars = String(md).replace(/\s/g, '').length;
  const cjk = (String(md).match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (String(md).match(/[A-Za-z0-9]+/g) || []).length;
  const minutes = Math.max(1, Math.round(cjk / 350 + words / 220 + (chars - cjk) / 900));
  return minutes;
}

export function wireCodeCopy(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy-code]');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code');
    if (!code) return;
    const text = code.textContent;
    const done = () => {
      btn.textContent = '已复制';
      setTimeout(() => (btn.textContent = '复制'), 1600);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(() => {});
    else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    }
  });
}
