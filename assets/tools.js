import { icon } from './icons.js';
import { $, $$, esc, toast, copyText, formatBytes, highlightJson, debounce, bindCopyButtons } from './ui.js';

/* ==========================================================================
   categories
   ========================================================================== */
export const CATEGORIES = [
  { id: 'media', name: '媒体处理', color: 'var(--cat-media)' },
  { id: 'dev', name: '文本与开发', color: 'var(--cat-dev)' },
  { id: 'daily', name: '日常工具', color: 'var(--cat-daily)' },
];

export const catOf = (id) => CATEGORIES.find((c) => c.id === id);

/* ==========================================================================
   shared markup helpers
   ========================================================================== */
const pane = (head, body) => `<div class="pane"><div class="pane-head">${head}</div><div class="pane-body">${body}</div></div>`;
const paneHead = (label, iconName, right = '') =>
  `<span class="pane-head-left">${icon(iconName)}${label}</span><div class="btn-row">${right}</div>`;
const copyIcon = (key, label = '复制') =>
  `<button class="btn-icon" type="button" data-copy="${key}" data-copy-label="${label}" title="${label}" aria-label="${label}">${icon('copy')}</button>`;
const field = (label, inner, hint = '') =>
  `<div class="field"><label class="field-label"><span>${label}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</label>${inner}</div>`;
const note = (text, iconName = 'shield') => `<span class="note">${icon(iconName)}${text}</span>`;

function stat(label, value, accent = false) {
  return `<div class="stat${accent ? ' accent' : ''}"><span class="num" data-stat="${label}">${value}</span><span class="label">${label}</span></div>`;
}

/* ==========================================================================
   1 · JSON 格式化
   ========================================================================== */
const jsonTool = {
  id: 'json',
  name: 'JSON 格式化',
  desc: '格式化、压缩与校验，一眼看清嵌套结构。',
  sub: '把压缩成一行的接口响应摊开看：语法错误会指出大概位置，复制出来的结果保持缩进。',
  cat: 'dev',
  tags: ['json', '格式化', '压缩', '校验', '数据'],
  icon: 'braces',
  mount(root) {
    const demo = {
      name: 'wlixill',
      purpose: '让日常更简单',
      tools: ['JSON', '文本', '时间', '密码'],
      ready: true,
      stats: { local: true, uploads: 0 },
    };
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="split">
            ${pane(
              paneHead('原始 JSON', 'braces', `<button class="btn btn-ghost btn-sm" type="button" data-act="demo">载入示例</button>`),
              `<textarea class="editor" id="json-in" spellcheck="false" autocomplete="off" placeholder='{ "hello": "world" }'></textarea>`
            )}
            ${pane(
              paneHead('处理结果', 'sparkles', `<span class="status" id="json-status"></span>${copyIcon('out')}`),
              `<pre class="code" id="json-out"></pre>`
            )}
          </div>
        </div>
        <div class="panel-foot">
          <div class="btn-row">
            <button class="btn btn-primary" type="button" data-act="format">${icon('sparkles')}格式化</button>
            <button class="btn" type="button" data-act="minify">${icon('minus')}压缩一行</button>
            <button class="btn btn-ghost" type="button" data-act="clear">${icon('trash')}清空</button>
          </div>
          ${note('内容只在本地浏览器里解析')}
        </div>
      </section>`;

    const input = $('#json-in', root);
    const out = $('#json-out', root);
    const status = $('#json-status', root);
    let current = '';

    root.__copyValues = { out: () => current };

    const render = (minify) => {
      const text = input.value.trim();
      if (!text) {
        current = '';
        out.innerHTML = '';
        out.classList.add('empty');
        status.textContent = '';
        return;
      }
      try {
        const data = JSON.parse(text);
        current = minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
        out.innerHTML = highlightJson(current);
        const lines = current.split('\n').length;
        status.className = 'status ok';
        status.textContent = `合法 · ${lines} 行 · ${formatBytes(new Blob([current]).size)}`;
      } catch (err) {
        current = '';
        const msg = String(err.message || err);
        const m = /position (\d+)/.exec(msg);
        let where = '';
        if (m) {
          const pos = Number(m[1]);
          const before = text.slice(0, pos);
          where = ` · 第 ${before.split('\n').length} 行第 ${pos - before.lastIndexOf('\n')} 列`;
        }
        out.innerHTML = `<span class="muted">${esc(msg)}</span>`;
        status.className = 'status err';
        status.textContent = `解析失败${where}`;
      }
    };

    const debounced = debounce(() => render(false), 260);
    input.addEventListener('input', debounced);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = input.selectionStart;
        input.setRangeText('  ', s, input.selectionEnd, 'end');
        render(false);
      }
    });

    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (!act) return;
      if (act === 'demo') {
        input.value = JSON.stringify(demo);
        render(false);
        toast('已载入示例 JSON');
      } else if (act === 'format') {
        render(false);
        if (current) toast('已格式化');
      } else if (act === 'minify') {
        render(true);
        if (current) toast('已压缩');
      } else if (act === 'clear') {
        input.value = '';
        render(false);
        input.focus();
      }
    });

    input.value = JSON.stringify(demo, null, 2);
    render(false);
  },
};

/* ==========================================================================
   2 · 文本统计
   ========================================================================== */
const textTool = {
  id: 'text',
  name: '文本统计',
  desc: '字数、汉字、单词与行数，边写边数。',
  sub: '粘贴一篇稿子或一段随手记，实时统计字数、汉字、英文单词与行数，还能一键清掉多余空行。',
  cat: 'dev',
  tags: ['文本', '字数', '统计', '写作', '汉字'],
  icon: 'text',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <textarea class="editor" id="t-in" placeholder="粘贴文章、笔记或一段灵感…" spellcheck="false"></textarea>
          <div class="stat-grid" style="margin-top:12px">
            ${stat('字符（不含空白）', '0', true)}
            ${stat('汉字', '0')}
            ${stat('英文单词', '0')}
            ${stat('行数', '0')}
          </div>
        </div>
        <div class="panel-foot">
          <div class="btn-row">
            <button class="btn" type="button" data-act="clean">${icon('sparkles')}清理空行</button>
            <button class="btn" type="button" data-act="copy">${icon('copy')}复制文本</button>
            <button class="btn btn-ghost" type="button" data-act="clear">${icon('trash')}清空</button>
          </div>
          ${note('实时统计，不会保存输入')}
        </div>
      </section>`;

    const input = $('#t-in', root);
    const nums = $$('[data-stat]', root);

    const update = () => {
      const v = input.value;
      const noSpace = v.replace(/\s/g, '').length;
      const han = (v.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
      const words = (v.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9_'’-]+/g) || []).length;
      const lines = v.length ? v.split(/\r\n|\r|\n/).length : 0;
      [noSpace, han, words, lines].forEach((n, i) => (nums[i].textContent = n.toLocaleString('zh-CN')));
    };

    input.addEventListener('input', update);
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (!act) return;
      if (act === 'clean') {
        input.value = input.value
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map((l) => l.replace(/[ \t]+$/g, ''))
          .filter((l, i, arr) => l.trim() || (i > 0 && arr[i - 1].trim()))
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        update();
        toast('已清理多余空行');
      } else if (act === 'copy') {
        copyText(input.value, '文本已复制');
      } else if (act === 'clear') {
        input.value = '';
        update();
        input.focus();
      }
    });
  },
};

/* ==========================================================================
   3 · 时间戳转换
   ========================================================================== */
const pad = (n) => String(n).padStart(2, '0');

function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const timestampTool = {
  id: 'timestamp',
  name: '时间戳转换',
  desc: '秒与毫秒互转，日期一眼读懂。',
  sub: 'Unix 时间戳、本地时间与 UTC 三者互转，支持秒和毫秒，避免在接口调试里数零。',
  cat: 'daily',
  tags: ['时间', '时间戳', 'unix', '日期', 'utc'],
  icon: 'clock',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="split">
            <div>
              ${field(
                'Unix 时间戳',
                `<div class="inline-group"><input class="input" id="ts-in" inputmode="numeric" placeholder="例如 1735689600" autocomplete="off" />
                 <div class="seg" role="group" aria-label="时间戳单位">
                   <button type="button" data-unit="s" aria-pressed="true">秒</button>
                   <button type="button" data-unit="ms" aria-pressed="false">毫秒</button>
                 </div></div>`,
                '<span id="ts-unit-hint">秒（s）</span>'
              )}
              <div class="btn-row" style="margin-top:12px">
                <button class="btn btn-primary" type="button" data-act="to-date">${icon('arrowRight')}转为日期</button>
                <button class="btn btn-ghost" type="button" data-act="now">${icon('clockSmall')}使用当前时间</button>
              </div>
            </div>
            <div>
              ${field('本地日期与时间', `<input class="input" id="ts-local" type="datetime-local" step="1" />`)}
              <div class="btn-row" style="margin-top:12px">
                <button class="btn" type="button" data-act="to-stamp">${icon('arrowRight')}转为时间戳</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">${icon('clock')}换算结果</span>
          <span class="status" id="ts-status"></span>
        </div>
        <div class="panel-body">
          <div class="kv-list">
            ${['本地时间', 'UTC 时间', '秒时间戳', '毫秒时间戳']
              .map(
                (label, i) => `<div class="kv"><dt>${label}</dt><dd data-val="${i}">—</dd>
                <button class="btn-icon" type="button" data-idx="${i}" title="复制" aria-label="复制${label}">${icon('copy')}</button></div>`
              )
              .join('')}
          </div>
        </div>
        <div class="panel-foot">
          ${note('时区取自当前浏览器：' + Intl.DateTimeFormat().resolvedOptions().timeZone, 'info')}
          <span class="note" id="ts-now"></span>
        </div>
      </section>`;

    const input = $('#ts-in', root);
    const local = $('#ts-local', root);
    const vals = $$('[data-val]', root);
    const status = $('#ts-status', root);
    let unit = 's';
    let date = new Date();

    const paint = () => {
      vals[0].textContent = date.toLocaleString('zh-CN', { hour12: false });
      vals[1].textContent = date.toISOString();
      vals[2].textContent = String(Math.floor(date.getTime() / 1000));
      vals[3].textContent = String(date.getTime());
    };

    const setDate = (d, msg) => {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
        status.className = 'status err';
        status.textContent = '无法识别这个时间';
        return;
      }
      date = d;
      paint();
      status.className = 'status ok';
      if (msg) status.textContent = msg;
      local.value = toLocalInput(d);
    };

    root.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-unit]');
      if (seg) {
        unit = seg.getAttribute('data-unit');
        $$('[data-unit]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === seg)));
        $('#ts-unit-hint', root).textContent = unit === 's' ? '秒（s）' : '毫秒（ms）';
        return;
      }
      const copyBtn = e.target.closest('[data-idx]');
      if (copyBtn) {
        copyText(vals[Number(copyBtn.getAttribute('data-idx'))].textContent, '已复制');
        return;
      }
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (!act) return;
      if (act === 'to-date') {
        const n = input.value.trim();
        if (!n) return setDate(new Date(), null);
        const num = Number(n.replace(/[^\d-]/g, ''));
        if (!Number.isFinite(num) || num === 0) {
          status.className = 'status err';
          status.textContent = '请输入数字时间戳';
          return;
        }
        setDate(new Date(unit === 's' ? num * 1000 : num), '已转换');
      } else if (act === 'now') {
        input.value = String(unit === 's' ? Math.floor(Date.now() / 1000) : Date.now());
        setDate(new Date(), '已使用当前时间');
      } else if (act === 'to-stamp') {
        if (!local.value) {
          status.className = 'status err';
          status.textContent = '先选一个日期';
          return;
        }
        setDate(new Date(local.value), '已转换');
      }
    });

    const nowEl = $('#ts-now', root);
    const tick = () => {
      nowEl.textContent = `现在 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
    };
    tick();
    const timer = setInterval(tick, 1000);

    input.value = String(Math.floor(Date.now() / 1000));
    local.value = toLocalInput(new Date());
    setDate(new Date(), '已同步当前时间');

    return () => clearInterval(timer);
  },
};

/* ==========================================================================
   4 · 密码生成
   ========================================================================== */
function secureRandomInt(max) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  let n;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return n % max;
}

const passwordTool = {
  id: 'password',
  name: '密码生成',
  desc: '自定义长度与字符集，用真随机源。',
  sub: '基于 crypto.getRandomValues 生成，可指定长度与字符类型，结果只在内存里出现一次。',
  cat: 'daily',
  tags: ['密码', '随机', '安全', '生成'],
  icon: 'key',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="pw-output" id="pw-out" aria-live="polite"></div>
          <div class="pw-actions">
            <button class="btn" type="button" data-act="regen">${icon('refresh')}重新生成</button>
            <button class="btn btn-primary" type="button" data-act="copy">${icon('copy')}复制密码</button>
          </div>

          <div class="field" style="margin-top:20px">
            <label class="field-label"><span>密码长度</span><span class="hint mono" id="pw-len">20</span></label>
            <input class="range" id="pw-range" type="range" min="4" max="64" value="20" />
          </div>

          <div class="field">
            <span class="field-label">包含字符</span>
            <div class="check-grid">
              <label class="check"><input type="checkbox" data-set="lower" checked /> 小写字母 <code>a-z</code></label>
              <label class="check"><input type="checkbox" data-set="upper" checked /> 大写字母 <code>A-Z</code></label>
              <label class="check"><input type="checkbox" data-set="digit" checked /> 数字 <code>0-9</code></label>
              <label class="check"><input type="checkbox" data-set="symbol" checked /> 符号 <code>!@#$</code></label>
            </div>
          </div>
        </div>
        <div class="panel-foot">
          ${note('使用安全随机数生成，密码不会被保存')}
          <span class="note" id="pw-strength"></span>
        </div>
      </section>`;

    const out = $('#pw-out', root);
    const range = $('#pw-range', root);
    const lenLabel = $('#pw-len', root);
    const strength = $('#pw-strength', root);
    const sets = { lower: 'abcdefghijkmnopqrstuvwxyz', upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', digit: '23456789', symbol: '!@#$%^&*()-_=+[]{}:,.?' };
    let password = '';

    const activeSets = () =>
      $$('[data-set]', root)
        .filter((c) => c.checked)
        .map((c) => sets[c.getAttribute('data-set')]);

    const generate = () => {
      const pools = activeSets();
      if (!pools.length) {
        out.textContent = '至少选择一种字符';
        out.classList.add('empty-pw');
        password = '';
        strength.textContent = '';
        return;
      }
      const len = Number(range.value);
      const all = pools.join('');
      const chars = pools.map((p) => p[secureRandomInt(p.length)]);
      while (chars.length < len) chars.push(all[secureRandomInt(all.length)]);
      for (let i = chars.length - 1; i > 0; i--) {
        const j = secureRandomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      password = chars.join('');
      out.textContent = password;
      out.classList.remove('empty-pw');
      const entropy = Math.round(len * Math.log2(all.length));
      strength.textContent = `约 ${entropy} bit 熵`;
    };

    const paintRange = () => {
      const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
      range.style.setProperty('--fill', `${pct}%`);
      lenLabel.textContent = range.value;
    };

    range.addEventListener('input', () => {
      paintRange();
      generate();
    });
    $$('[data-set]', root).forEach((c) => c.addEventListener('change', generate));
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (act === 'regen') {
        const before = password;
        generate();
        if (before) toast('换了一组');
      } else if (act === 'copy') copyText(password, '密码已复制');
    });

    paintRange();
    generate();
  },
};

/* ==========================================================================
   5 · Base64 / 6 · URL 编解码（共用结构）
   ========================================================================== */
function codecTool({ id, name, desc, sub, tags, iconName, encode, decode, placeholder, example, encodeLabel = '编码', decodeLabel = '解码' }) {
  return {
    id,
    name,
    desc,
    sub,
    cat: 'dev',
    tags,
    icon: iconName,
    mount(root) {
      root.innerHTML = `
        <section class="panel">
          <div class="panel-body">
            <div class="split">
              ${pane(
                paneHead('输入内容', 'text', `<button class="btn btn-ghost btn-sm" type="button" data-act="example">示例</button><button class="btn-icon" type="button" data-act="clear" title="清空" aria-label="清空">${icon('trash')}</button>`),
                `<textarea class="editor" id="cd-in" spellcheck="false" placeholder="${esc(placeholder)}"></textarea>`
              )}
              ${pane(
                paneHead('处理结果', 'sparkles', `<span class="status" id="cd-status"></span>${copyIcon('out')}`),
                `<pre class="code" id="cd-out"></pre>`
              )}
            </div>
          </div>
          <div class="panel-foot">
            <div class="btn-row">
              <button class="btn btn-primary" type="button" data-act="encode">${icon('arrowRight')}${encodeLabel}</button>
              <button class="btn" type="button" data-act="decode">${icon('arrowLeft')}${decodeLabel}</button>
            </div>
            ${note('支持中文与 Emoji，UTF-8 编码')}
          </div>
        </section>`;

      const input = $('#cd-in', root);
      const out = $('#cd-out', root);
      const status = $('#cd-status', root);
      let current = '';
      root.__copyValues = { out: () => current };

      const run = (mode) => {
        const text = input.value;
        if (!text) {
          current = '';
          out.innerHTML = '<span class="muted">等待输入…</span>';
          status.textContent = '';
          return;
        }
        try {
          current = mode === 'encode' ? encode(text) : decode(text);
          out.textContent = current;
          status.className = 'status ok';
          status.textContent = `${current.length} 字符`;
        } catch {
          current = '';
          out.innerHTML = '<span class="muted">这串内容无法解析，检查一下格式</span>';
          status.className = 'status err';
          status.textContent = mode === 'encode' ? '编码失败' : '解码失败';
        }
      };

      root.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.getAttribute('data-act');
        if (!act) return;
        if (act === 'encode') run('encode');
        else if (act === 'decode') run('decode');
        else if (act === 'example') {
          input.value = example;
          run('encode');
        } else if (act === 'clear') {
          input.value = '';
          run('encode');
          input.focus();
        }
      });

      input.value = '';
      run('encode');
    },
  };
}

const b64encode = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const b64decode = (text) => {
  const bin = atob(text.trim().replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const base64Tool = codecTool({
  id: 'base64',
  name: 'Base64 编解码',
  desc: 'UTF-8 安全的中英混排编解码。',
  sub: '把文本转成 Base64 或还原回来，中文和 Emoji 都不会乱码。',
  tags: ['base64', '编码', '解码', 'utf8'],
  iconName: 'code',
  encode: b64encode,
  decode: b64decode,
  placeholder: '输入原文或 Base64 文本…',
  example: '粒子工作台 · Particle Desk',
});

const urlTool = codecTool({
  id: 'url',
  name: 'URL 编解码',
  desc: '参数百分号编码与还原。',
  sub: '调试接口时把 URL 参数值转成百分号编码，或把一大串 %E4%BD… 还原成人话。',
  tags: ['url', '编码', '解码', '百分号', 'query'],
  iconName: 'link',
  encode: (text) => encodeURIComponent(text),
  decode: (text) => decodeURIComponent(text.trim().replace(/\+/g, ' ')),
  placeholder: '输入原文或 %E4%BD%A0%E5%A5%BD 这样的编码…',
  example: 'https://example.com/search?q=粒子工作台&lang=zh-CN',
});

/* ==========================================================================
   7 · UUID 生成
   ========================================================================== */
const uuidTool = {
  id: 'uuid',
  name: 'UUID 生成',
  desc: '批量生成 v4 标识符，最多 100 条。',
  sub: '为记录、任务或测试数据生成随机 UUID v4，一次最多 100 条，点一下整段复制。',
  cat: 'dev',
  tags: ['uuid', 'guid', '随机', 'id'],
  icon: 'fingerprint',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="inline-row">
            ${field('生成数量（1–100）', `<input class="input" id="uuid-count" type="number" min="1" max="100" value="8" />`)}
            <button class="btn btn-primary" type="button" data-act="gen">${icon('sparkles')}生成 UUID</button>
          </div>
          <pre class="code plain" id="uuid-out" style="margin-top:14px"></pre>
        </div>
        <div class="panel-foot">
          ${note('使用浏览器 crypto.randomUUID 生成')}
          <div class="btn-row">
            <button class="btn btn-sm" type="button" data-act="copy">${icon('copy')}复制全部</button>
          </div>
        </div>
      </section>`;

    const count = $('#uuid-count', root);
    const out = $('#uuid-out', root);
    let lines = [];
    root.__copyValues = { out: () => lines.join('\n') };

    const gen = () => {
      const n = Math.min(100, Math.max(1, Math.round(Number(count.value) || 1)));
      count.value = String(n);
      lines = Array.from({ length: n }, () =>
        crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        })
      );
      out.textContent = lines.join('\n');
    };

    count.addEventListener('change', gen);
    count.addEventListener('keydown', (e) => e.key === 'Enter' && gen());
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (act === 'gen') gen();
      else if (act === 'copy') copyText(lines.join('\n'), `已复制 ${lines.length} 条`);
    });
    gen();
  },
};

/* ==========================================================================
   8 · 哈希计算
   ========================================================================== */
const hashTool = {
  id: 'hash',
  name: '哈希计算',
  desc: 'SHA-256 / SHA-512 摘要，直接调 WebCrypto。',
  sub: '校验两段文本是否一致，或为内容生成指纹。计算在浏览器原生 WebCrypto 里完成，速度很快。',
  cat: 'dev',
  tags: ['hash', 'sha256', 'sha512', '摘要', '校验'],
  icon: 'hash',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="inline-row" style="justify-content:space-between">
            <div class="seg" role="group" aria-label="算法">
              <button type="button" data-alg="SHA-256" aria-pressed="true">SHA-256</button>
              <button type="button" data-alg="SHA-512" aria-pressed="false">SHA-512</button>
            </div>
            <span class="status" id="hash-status"></span>
          </div>
          <div class="field" style="margin-top:14px">
            <label class="field-label"><span>原始文本</span><span class="hint">允许为空</span></label>
            <textarea class="editor" id="hash-in" spellcheck="false" placeholder="粘贴要校验的文本…"></textarea>
          </div>
          <div class="field">
            <span class="field-label">摘要</span>
            <div class="hash-out"><code id="hash-out">—</code>${copyIcon('out')}</div>
          </div>
        </div>
        <div class="panel-foot">
          ${note('哈希不可逆，不等同于加密')}
          <button class="btn btn-sm" type="button" data-act="calc">${icon('sparkles')}计算哈希</button>
        </div>
      </section>`;

    const input = $('#hash-in', root);
    const out = $('#hash-out', root);
    const status = $('#hash-status', root);
    let alg = 'SHA-256';
    let current = '';
    root.__copyValues = { out: () => current };

    const digest = async () => {
      const data = new TextEncoder().encode(input.value);
      const buf = await crypto.subtle.digest(alg, data);
      current = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      out.textContent = current;
      status.className = 'status ok';
      status.textContent = `${alg} · ${input.value.length} 字符`;
    };

    root.addEventListener('click', async (e) => {
      const seg = e.target.closest('[data-alg]');
      if (seg) {
        alg = seg.getAttribute('data-alg');
        $$('[data-alg]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === seg)));
        await digest();
        return;
      }
      if (e.target.closest('[data-act="calc"]')) {
        await digest();
        toast('摘要已更新');
      }
    });

    input.addEventListener('input', debounce(digest, 240));
    digest();
  },
};

/* ==========================================================================
   9 · 颜色转换
   ========================================================================== */
function hexToRgb(hex) {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const hslToHex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};

const colorTool = {
  id: 'color',
  name: '颜色转换',
  desc: 'HEX / RGB / HSL 互转，附带色阶。',
  sub: '吸一个颜色，直接拿到 HEX、rgb() 与 hsl() 三种写法，顺手生成同色系的深浅变化。',
  cat: 'daily',
  tags: ['颜色', '设计', 'hex', 'rgb', 'hsl', '调色'],
  icon: 'palette',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="color-layout">
            <div class="color-preview">
              <div class="color-swatch" id="sw"></div>
              <span class="color-swatch-label" id="sw-label">#5CE1C6</span>
              <input type="color" id="picker" value="#5ce1c6" aria-label="选择颜色" />
            </div>
            <div>
              ${field('HEX 色值', `<input class="input mono" id="hex-in" value="#5CE1C6" maxlength="7" spellcheck="false" />`, '支持 #RGB 与 #RRGGBB')}
              <div style="height:12px"></div>
              <div class="copy-row"><span class="label">HEX</span><span class="value" id="v-hex">#5CE1C6</span><button class="btn-icon" data-copy="hex" title="复制">${icon('copy')}</button></div>
              <div class="copy-row"><span class="label">RGB</span><span class="value" id="v-rgb">rgb(92, 225, 198)</span><button class="btn-icon" data-copy="rgb" title="复制">${icon('copy')}</button></div>
              <div class="copy-row"><span class="label">HSL</span><span class="value" id="v-hsl">hsl(167, 69%, 62%)</span><button class="btn-icon" data-copy="hsl" title="复制">${icon('copy')}</button></div>
            </div>
          </div>
          <div class="shade-row" id="shades"></div>
        </div>
        <div class="panel-foot">${note('点击下方色块可以直接换色', 'info')}</div>
      </section>`;

    const picker = $('#picker', root);
    const hexIn = $('#hex-in', root);
    const sw = $('#sw', root);
    const swLabel = $('#sw-label', root);
    const shades = $('#shades', root);
    let rgb = { r: 92, g: 225, b: 198 };
    let hex = '#5CE1C6';
    let hsl = { h: 167, s: 69, l: 62 };
    root.__copyValues = {
      hex: () => hex,
      rgb: () => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      hsl: () => `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    };

    const paint = () => {
      sw.style.background = hex;
      swLabel.textContent = hex;
      picker.value = hex.toLowerCase();
      hexIn.value = hex;
      $('#v-hex', root).textContent = hex;
      $('#v-rgb', root).textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      $('#v-hsl', root).textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
      const steps = [-36, -24, -12, 12, 24, 36];
      shades.innerHTML = steps
        .map((d) => {
          const c = hslToHex(hsl.h, hsl.s, Math.max(6, Math.min(94, hsl.l + d))).toUpperCase();
          return `<button class="shade" type="button" data-hex="${c}" title="${c}" style="background:${c}"></button>`;
        })
        .join('');
    };

    const fromHex = (input) => {
      const parsed = hexToRgb(input);
      if (!parsed) return false;
      rgb = parsed;
      hex = '#' + [rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      hsl = rgbToHsl(rgb);
      paint();
      return true;
    };

    picker.addEventListener('input', () => fromHex(picker.value));
    hexIn.addEventListener('input', () => {
      if (fromHex(hexIn.value)) hexIn.classList.remove('bad');
      else hexIn.classList.add('bad');
    });
    shades.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hex]');
      if (b) fromHex(b.getAttribute('data-hex'));
    });

    fromHex('#5CE1C6');
  },
};

/* ==========================================================================
   10 · 单位换算
   ========================================================================== */
const UNIT_GROUPS = {
  length: {
    label: '长度',
    units: [
      ['m', '米 m', 1],
      ['cm', '厘米 cm', 0.01],
      ['mm', '毫米 mm', 0.001],
      ['km', '千米 km', 1000],
      ['in', '英寸 in', 0.0254],
      ['ft', '英尺 ft', 0.3048],
      ['mi', '英里 mi', 1609.344],
    ],
  },
  weight: {
    label: '重量',
    units: [
      ['kg', '千克 kg', 1],
      ['g', '克 g', 0.001],
      ['mg', '毫克 mg', 0.000001],
      ['t', '吨 t', 1000],
      ['lb', '磅 lb', 0.45359237],
      ['oz', '盎司 oz', 0.028349523125],
    ],
  },
  temperature: { label: '温度', units: [['c', '摄氏度 °C'], ['f', '华氏度 °F'], ['k', '开尔文 K']] },
};

const convertTemp = (v, from, to) => {
  let c = from === 'c' ? v : from === 'f' ? ((v - 32) * 5) / 9 : v - 273.15;
  if (to === 'c') return c;
  if (to === 'f') return (c * 9) / 5 + 32;
  return c + 273.15;
};

const unitTool = {
  id: 'unit',
  name: '单位换算',
  desc: '长度、重量、温度，输入即换算。',
  sub: '写文案时换算尺寸、做菜时换算重量、看国外天气时换算温度，直接改数字就行。',
  cat: 'daily',
  tags: ['单位', '换算', '长度', '重量', '温度'],
  icon: 'ruler',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="seg accent" role="group" aria-label="换算类型" id="unit-cat">
            ${Object.entries(UNIT_GROUPS).map(([k, g], i) => `<button type="button" data-cat="${k}" aria-pressed="${i === 0}">${g.label}</button>`).join('')}
          </div>
          <div class="field" style="margin-top:16px;max-width:260px">
            <label class="field-label"><span>数值</span></label>
            <input class="input" id="unit-value" type="number" value="1" step="any" inputmode="decimal" />
          </div>
          <div class="unit-pair">
            ${field('原单位', `<select class="input" id="unit-from"></select>`)}
            <button class="swap-btn" type="button" data-act="swap" title="交换单位" aria-label="交换单位">${icon('swap')}</button>
            ${field('目标单位', `<select class="input" id="unit-to"></select>`)}
          </div>
          <div class="unit-result">
            <span class="mono" id="unit-out">1</span>
            <span class="unit-from-label" id="unit-out-unit"></span>
            <button class="btn-icon" type="button" data-act="copy" title="复制结果" aria-label="复制结果">${icon('copy')}</button>
          </div>
        </div>
        <div class="panel-foot">${note('换算结果保留 6 位有效数字')}</div>
      </section>`;

    const catEl = $('#unit-cat', root);
    const valueEl = $('#unit-value', root);
    const fromEl = $('#unit-from', root);
    const toEl = $('#unit-to', root);
    const outEl = $('#unit-out', root);
    const outUnitEl = $('#unit-out-unit', root);
    let cat = 'length';
    let result = '1';
    root.__copyValues = { out: () => result };

    const fillUnits = () => {
      const units = UNIT_GROUPS[cat].units;
      const opts = units.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
      fromEl.innerHTML = opts;
      toEl.innerHTML = opts;
      fromEl.value = units[0][0];
      toEl.value = (units[1] || units[0])[0];
      compute();
    };

    const compute = () => {
      const v = Number(valueEl.value);
      const from = fromEl.value;
      const to = toEl.value;
      if (!Number.isFinite(v)) {
        result = '—';
        outEl.textContent = result;
        outUnitEl.textContent = '';
        return;
      }
      let out;
      if (cat === 'temperature') out = convertTemp(v, from, to);
      else {
        const map = Object.fromEntries(UNIT_GROUPS[cat].units.map(([id, , f]) => [id, f]));
        out = (v * map[from]) / map[to];
      }
      const rounded = Math.abs(out) >= 1e9 || (Math.abs(out) < 1e-6 && out !== 0) ? out.toExponential(4) : Number(out.toPrecision(6)).toString();
      result = rounded;
      outEl.textContent = rounded;
      outUnitEl.textContent = (UNIT_GROUPS[cat].units.find((u) => u[0] === to) || [])[1] || '';
    };

    valueEl.addEventListener('input', compute);
    fromEl.addEventListener('change', compute);
    toEl.addEventListener('change', compute);
    catEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      cat = b.getAttribute('data-cat');
      $$('[data-cat]', catEl).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      fillUnits();
    });
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (act === 'swap') {
        const a = fromEl.value;
        fromEl.value = toEl.value;
        toEl.value = a;
        compute();
      } else if (act === 'copy') copyText(`${result} ${outUnitEl.textContent}`, '结果已复制');
    });

    fillUnits();
  },
};

/* ==========================================================================
   11 · 计算器
   ========================================================================== */
const calcTool = {
  id: 'calc',
  name: '计算器',
  desc: '支持括号与幂运算，回车即算。',
  sub: '手边快速算一笔：支持四则、括号、^ 幂与 % 取余，也可以直接用键盘敲。',
  cat: 'daily',
  tags: ['计算器', '数学', '计算', '表达式'],
  icon: 'calculator',
  mount(root) {
    const keys = [
      ['⌫', 'back', 'mute'],
      ['(', 'ins', 'mute'],
      [')', 'ins', 'mute'],
      ['÷', '/', 'op'],
      ['7', 'ins', ''],
      ['8', 'ins', ''],
      ['9', 'ins', ''],
      ['×', '*', 'op'],
      ['4', 'ins', ''],
      ['5', 'ins', ''],
      ['6', 'ins', ''],
      ['−', '-', 'op'],
      ['1', 'ins', ''],
      ['2', 'ins', ''],
      ['3', 'ins', ''],
      ['+', '+', 'op'],
      ['0', 'ins', ''],
      ['.', 'ins', ''],
      ['%', '%', 'op'],
      ['=', 'eq', 'eq'],
    ];
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="calc-layout">
            <div>
              <div class="calc-display">
                <input class="calc-expression" id="calc-expr" placeholder="例如 (12 + 8) × 3 或 2 ^ 10" autocomplete="off" spellcheck="false" />
                <div class="calc-result" id="calc-result">0</div>
              </div>
              <div class="btn-row" style="margin-top:12px;justify-content:space-between">
                <span class="note muted" style="font-size:11.5px">^ 表示幂，% 表示取余</span>
                <div class="btn-row">
                  <button class="btn btn-sm btn-ghost" type="button" data-act="clear">${icon('trash')}清空</button>
                  <button class="btn btn-sm" type="button" data-act="copy">${icon('copy')}复制结果</button>
                </div>
              </div>
            </div>
            <div class="keypad">
              ${keys
                .map(([label, op, cls]) =>
                  `<button class="key ${cls}" type="button" data-op="${op}" data-char="${esc(label)}" aria-label="${op === 'back' ? '退格' : esc(label)}">${op === 'back' ? icon('backspace') : esc(label)}</button>`
                )
                .join('')}
            </div>
          </div>
        </div>
      </section>`;

    const expr = $('#calc-expr', root);
    const result = $('#calc-result', root);

    const evaluate = () => {
      const raw = expr.value.trim();
      if (!raw) {
        result.textContent = '0';
        result.classList.remove('err');
        return '';
      }
      const normalized = raw
        .replace(/[×✕]/g, '*')
        .replace(/[÷]/g, '/')
        .replace(/[−–—]/g, '-')
        .replace(/\^/g, '**');
      if (!/^[-+*/%().\d\s*]+$/.test(normalized)) {
        result.textContent = '不支持的字符';
        result.classList.add('err');
        return '';
      }
      try {
        // eslint-disable-next-line no-new-func
        const value = Function(`"use strict";return (${normalized});`)();
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('not finite');
        const text = Number(value.toPrecision(12)).toString();
        result.textContent = text;
        result.classList.remove('err');
        return text;
      } catch {
        result.textContent = '表达式有误';
        result.classList.add('err');
        return '';
      }
    };

    const insert = (txt) => {
      const s = expr.selectionStart ?? expr.value.length;
      const e = expr.selectionEnd ?? expr.value.length;
      expr.setRangeText(txt, s, e, 'end');
      expr.focus();
      evaluate();
    };

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-op]');
      if (btn) {
        const op = btn.getAttribute('data-op');
        if (op === 'ins') insert(btn.getAttribute('data-char'));
        else if (op === 'back') {
          const s = expr.selectionStart ?? expr.value.length;
          if (s > 0 && expr.selectionStart === expr.selectionEnd) expr.setRangeText('', s - 1, s, 'end');
          else expr.setRangeText('', expr.selectionStart ?? 0, expr.selectionEnd ?? 0, 'end');
          expr.focus();
          evaluate();
        } else if (op === 'eq') {
          const v = evaluate();
          if (v) {
            expr.dataset.last = v;
            toast(`= ${v}`);
          }
        } else insert(btn.getAttribute('data-char'));
        return;
      }
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (act === 'clear') {
        expr.value = '';
        evaluate();
        expr.focus();
      } else if (act === 'copy') copyText(result.textContent, '结果已复制');
    });

    expr.addEventListener('input', evaluate);
    expr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = evaluate();
        if (v) toast(`= ${v}`);
      }
    });

    evaluate();
  },
};

/* ==========================================================================
   12 · 专注计时
   ========================================================================== */
const timerState = {
  total: 25 * 60,
  left: 25 * 60,
  running: false,
  deadline: 0,
  iv: 0,
  subs: new Set(),
  notify() {
    this.subs.forEach((fn) => fn());
  },
  start() {
    if (this.running) return;
    this.running = true;
    this.deadline = Date.now() + this.left * 1000;
    clearInterval(this.iv);
    this.iv = setInterval(() => this.tick(), 240);
    this.notify();
  },
  pause() {
    this.running = false;
    clearInterval(this.iv);
    this.notify();
  },
  toggle() {
    this.running ? this.pause() : this.start();
  },
  reset(total = this.total) {
    this.pause();
    this.total = total;
    this.left = total;
    this.notify();
  },
  tick() {
    const left = Math.max(0, Math.round((this.deadline - Date.now()) / 1000));
    if (left !== this.left) {
      this.left = left;
      this.notify();
    }
    if (left <= 0) this.finish();
  },
  finish() {
    this.pause();
    this.left = 0;
    this.notify();
    document.title = '时间到 · wlixill';
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.28, 0.56].forEach((t) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ac.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.22);
        o.connect(g).connect(ac.destination);
        o.start(ac.currentTime + t);
        o.stop(ac.currentTime + t + 0.24);
      });
    } catch { /* 静音环境忽略 */ }
    toast('专注结束，起来动一动', 'ok');
  },
};

const mmss = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const timerTool = {
  id: 'timer',
  name: '专注计时',
  desc: '番茄钟，切到别的工具也继续走。',
  sub: '25 分钟也好，5 分钟也行。切换工具时计时继续，停在页面标题上也能看见还剩多久。',
  cat: 'daily',
  tags: ['专注', '番茄钟', '计时', '时间管理'],
  icon: 'timer',
  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <div class="panel-body">
          <div class="timer-wrap">
            <div class="timer-dial">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="timer-track" cx="50" cy="50" r="44" />
                <circle class="timer-bar" id="timer-bar" cx="50" cy="50" r="44" />
              </svg>
              <div class="timer-readout">
                <span class="timer-digits" id="timer-digits">25:00</span>
                <span class="timer-state" id="timer-state">ready</span>
              </div>
            </div>
            <div>
              <div class="seg accent" role="group" aria-label="时长预设" id="timer-presets">
                ${[5, 25, 45].map((m) => `<button type="button" data-min="${m}" aria-pressed="${m === 25}">${m} 分钟</button>`).join('')}
              </div>
              <div class="field" style="margin-top:14px">
                <label class="field-label"><span>自定义时长（分钟）</span></label>
                <input class="input" id="timer-custom" type="number" min="1" max="180" placeholder="例如 30" />
              </div>
              <div class="btn-row" style="margin-top:16px">
                <button class="btn btn-primary" type="button" data-act="toggle" id="timer-toggle">${icon('play')}开始专注</button>
                <button class="btn btn-ghost" type="button" data-act="reset">${icon('reset')}重置</button>
              </div>
              <p class="muted" style="margin-top:14px;font-size:11.5px;line-height:1.7">切换工具时继续计时；刷新或关闭页面会重置。</p>
            </div>
          </div>
        </div>
      </section>`;

    const digits = $('#timer-digits', root);
    const stateEl = $('#timer-state', root);
    const bar = $('#timer-bar', root);
    const toggleBtn = $('#timer-toggle', root);
    const presets = $('#timer-presets', root);
    const custom = $('#timer-custom', root);
    const C = 2 * Math.PI * 44;

    bar.style.strokeDasharray = String(C);

    const paint = () => {
      digits.textContent = mmss(timerState.left);
      const ratio = timerState.total ? timerState.left / timerState.total : 1;
      bar.style.strokeDashoffset = String(C * (1 - ratio));
      let label = 'ready';
      if (timerState.running) label = 'focus';
      else if (timerState.left === 0) label = 'done';
      else if (timerState.left < timerState.total) label = 'paused';
      stateEl.textContent = label;
      toggleBtn.innerHTML = timerState.running
        ? `${icon('pause')}暂停`
        : `${icon('play')}${timerState.left === timerState.total ? '开始专注' : '继续'}`;
      if (timerState.running) document.title = `${mmss(timerState.left)} · 专注中`;
      else document.title = 'wlixill · 笔记与工具';
      presets.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(Number(b.dataset.min) * 60 === timerState.total));
      });
    };

    const setTotal = (minutes) => {
      const total = Math.round(minutes * 60);
      timerState.reset(total);
      paint();
    };

    timerState.subs.add(paint);
    paint();

    presets.addEventListener('click', (e) => {
      const b = e.target.closest('[data-min]');
      if (b) setTotal(Number(b.dataset.min));
    });
    custom.addEventListener('change', () => {
      const v = Math.min(180, Math.max(1, Number(custom.value) || 25));
      custom.value = String(v);
      setTotal(v);
    });
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.getAttribute('data-act');
      if (act === 'toggle') {
        if (timerState.left === 0) {
          timerState.reset(timerState.total);
          timerState.start();
        } else timerState.toggle();
        paint();
      } else if (act === 'reset') {
        timerState.reset(timerState.total);
        paint();
      }
    });

    return () => {
      timerState.subs.delete(paint);
      if (!timerState.running) document.title = 'wlixill · 笔记与工具';
    };
  },
};

/* ==========================================================================
   registry
   ========================================================================== */
const videoTool = {
  id: 'video',
  name: '视频格式转换',
  desc: '转码、提取音频、做 GIF，引擎在本地跑。',
  sub: 'MP4 / WebM / GIF / MP3 等 19 种输出，转码过程全部发生在浏览器里，视频不会被上传。首次使用需要加载约 31 MB 的转码引擎。',
  cat: 'media',
  tags: ['视频', '转码', '音频', 'gif', 'mp4', '格式'],
  icon: 'film',
  featured: true,
  mount(root) {
    return import('./video.js').then((m) => m.mountVideo(root));
  },
};

export const TOOLS = [
  videoTool,
  jsonTool,
  textTool,
  timestampTool,
  passwordTool,
  base64Tool,
  urlTool,
  uuidTool,
  hashTool,
  colorTool,
  unitTool,
  calcTool,
  timerTool,
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);
