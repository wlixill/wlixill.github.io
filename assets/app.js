import { TOOLS, CATEGORIES, catOf, toolById } from './tools.js';
import { icon } from './icons.js';
import { $, $$, esc, greeting, relTime, toast } from './ui.js';
import { parseFrontMatter, renderMarkdown, wireCodeCopy } from './markdown.js';

// Resolve against the deployed asset directory, not the current article URL.
const siteRoot = new URL('../', import.meta.url);
const postHref = (slug) => new URL(`posts/${encodeURIComponent(slug)}/`, siteRoot).pathname;
const archiveHref = new URL('posts/', siteRoot).pathname;
const rootHashUrl = (hash) => new URL(hash, siteRoot).href;
const staticPostSlug = document.body.dataset.staticPost;
const staticArchive = document.body.hasAttribute('data-static-archive');

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* 隐私模式忽略 */ }
  },
};

/* ==========================================================================
   profile (synced from GitHub by dev/fetch-github.mjs)
   ========================================================================== */
const DEFAULT_PROFILE = {
  login: 'wlixill',
  name: 'wlixill',
  avatar: 'assets/img/avatar.jpg',
  html_url: 'https://github.com/wlixill',
  bio: '',
};

let profile = { ...DEFAULT_PROFILE };

function paintProfile() {
  const img = $('.profile-avatar');
  if (img) {
    img.src = profile.avatar;
    img.alt = profile.name;
  }
  const name = $('.profile-name');
  if (name) name.textContent = profile.name;
}

const profileReady = fetch(new URL('content/profile.json', siteRoot), { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((p) => {
    if (p) profile = { ...DEFAULT_PROFILE, ...p };
  })
  .catch(() => {})
  .then(() => {
    paintProfile();
    return profile;
  });

paintProfile();

/* ==========================================================================
   theme
   ========================================================================== */
const themeToggle = $('#themeToggle');
const themeLabel = $('.theme-label', themeToggle);

function applyTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f5f2' : '#08090c');
  if (themeLabel) themeLabel.textContent = theme === 'light' ? '浅色' : '深色';
  if (persist) store.set('pd-theme', theme);
}

const savedTheme = store.get('pd-theme', null);
applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'), false);

themeToggle?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  toast(next === 'light' ? '切成浅色了' : '切成深色了');
});

matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  if (!store.get('pd-theme', null)) applyTheme(e.matches ? 'light' : 'dark', false);
});

/* ==========================================================================
   backdrop wallpaper
   ========================================================================== */
const backdropVideo = $('#backdropVideo');
const bgToggle = $('#bgToggle');
const bgLabel = $('.bg-label', bgToggle);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const saveData = Boolean(navigator.connection?.saveData);
const savedBackdrop = store.get('pd-bg', null);

// On a first touch-device visit retain the poster, but do not download the
// video. A visitor can explicitly switch the background off and back on.
const bgState = {
  on: savedBackdrop === null ? !saveData : Boolean(savedBackdrop),
  posterOnly: savedBackdrop === null && matchMedia('(pointer: coarse)').matches,
};

function syncBackdropControl() {
  const still = bgState.posterOnly || reduceMotion.matches;
  bgToggle?.setAttribute('aria-pressed', String(bgState.on));
  bgToggle?.setAttribute('aria-label', bgState.on ? `关闭${still ? '静态' : '动态'}背景` : '开启动态背景');
  if (bgLabel) bgLabel.textContent = bgState.on ? (still ? '静态' : '动态') : '背景关';
}

function ensureVideoSrc() {
  if (!backdropVideo || backdropVideo.dataset.loaded === '1') return;
  if (reduceMotion.matches || bgState.posterOnly) return;
  backdropVideo.src = backdropVideo.dataset.src;
  backdropVideo.dataset.loaded = '1';
  backdropVideo.load();
}

function playBackdrop() {
  if (!bgState.on || !backdropVideo) return;
  if (reduceMotion.matches || bgState.posterOnly) {
    backdropVideo.pause();
    return;
  }
  ensureVideoSrc();
  const started = backdropVideo.play();
  if (started && typeof started.catch === 'function') started.catch(() => {});
}

function applyBackdrop(on, persist = true) {
  bgState.on = on;
  if (persist && on) bgState.posterOnly = false;
  document.documentElement.setAttribute('data-bg', on ? 'on' : 'off');
  if (persist) store.set('pd-bg', on);
  syncBackdropControl();
  if (on) playBackdrop();
  else backdropVideo?.pause();
}

applyBackdrop(bgState.on, false);

bgToggle?.addEventListener('click', () => {
  applyBackdrop(!bgState.on);
  toast(bgState.on ? (reduceMotion.matches ? '静态背景已开启' : '动态背景已开启') : '背景已关闭');
});

reduceMotion.addEventListener?.('change', () => {
  playBackdrop();
  syncBackdropControl();
});

document.addEventListener('visibilitychange', () => {
  if (!backdropVideo) return;
  if (document.hidden) backdropVideo.pause();
  else playBackdrop();
});

backdropVideo?.addEventListener('error', () => {
  bgState.on = false;
  document.documentElement.setAttribute('data-bg', 'off');
  syncBackdropControl();
});

/* ==========================================================================
   posts
   ========================================================================== */
let postsPromise = null;
let postsCache = [];
const postCache = new Map();

function loadPosts() {
  if (!postsPromise) {
    postsPromise = fetch(new URL('content/posts.json', siteRoot), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('文章索引加载失败');
        return r.json();
      })
      .then((list) => {
        postsCache = list;
        return list;
      })
      .catch((err) => {
        postsPromise = null;
        throw err;
      });
  }
  return postsPromise;
}

async function loadPost(slug) {
  if (postCache.has(slug)) return postCache.get(slug);
  const list = await loadPosts();
  const meta = list.find((p) => p.slug === slug);
  if (!meta) return null;
  const res = await fetch(new URL(`content/posts/${encodeURIComponent(slug)}.md`, siteRoot), { cache: 'no-cache' });
  if (!res.ok) return null;
  const { body } = parseFrontMatter(await res.text());
  const rendered = renderMarkdown(body);
  const post = { ...meta, html: rendered.html, headings: rendered.headings };
  postCache.set(slug, post);
  return post;
}

let reposPromise = null;
let reposCache = [];

function loadRepos() {
  if (!reposPromise) {
    reposPromise = fetch(new URL('content/repos.json', siteRoot), { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        reposCache = list;
        return list;
      })
      .catch(() => []);
  }
  return reposPromise;
}

const fmtDate = (d) => String(d).replace(/-/g, '.');
const tagLink = (tag) => `<a class="tag" href="#/posts/${encodeURIComponent(tag)}">${esc(tag)}</a>`;

/* ==========================================================================
   navigation rail
   ========================================================================== */
const nav = $('#toolNav');

const MAIN_NAV = [
  { id: 'home', href: '#/', label: '首页', icon: 'house' },
  { id: 'posts', href: '#/posts', label: '文章', icon: 'text' },
  { id: 'tools', href: '#/tools', label: '工具箱', icon: 'grid' },
  { id: 'about', href: '#/about', label: '关于', icon: 'user' },
];

function buildNav() {
  nav.innerHTML = `
    <div class="nav-group">
      <div class="nav-group-label">博客</div>
      ${MAIN_NAV.map(
        (item) => `<a class="nav-item" href="${item.href}" data-nav="${item.id}">${icon(item.icon)}<span class="nav-name">${item.label}</span></a>`
      ).join('')}
    </div>
    <div class="nav-group">
      <div class="nav-group-label">最新文章</div>
      <div class="nav-posts" id="navPosts"></div>
    </div>`;
}

buildNav();

function paintNavPosts() {
  const slot = $('#navPosts');
  if (!slot) return;
  slot.innerHTML = postsCache
    .slice(0, 4)
    .map(
      (p) => `<a class="nav-post" href="${postHref(p.slug)}" data-slug="${p.slug}">
        <span class="nav-post-title">${esc(p.title)}</span>
        <span class="nav-post-date">${fmtDate(p.date)}</span>
      </a>`
    )
    .join('');
}

loadPosts()
  .then(() => {
    paintNavPosts();
    const route = parseRoute();
    setActiveNav(route.name, route);
    refreshPaletteData();
  })
  .catch(() => {});

/* mobile drawer */
const rail = $('#rail');
const scrim = $('#scrim');
const menuBtn = $('#menuBtn');
const narrowLayout = matchMedia('(max-width: 1024px)');

function setDrawer(open) {
  const wasOpen = rail.classList.contains('open');
  const show = Boolean(open && narrowLayout.matches);
  if (wasOpen && !show && narrowLayout.matches && rail.contains(document.activeElement)) {
    menuBtn?.focus({ preventScroll: true });
  }
  rail.classList.toggle('open', show);
  rail.inert = narrowLayout.matches && !show;
  if (rail.inert) rail.setAttribute('aria-hidden', 'true');
  else rail.removeAttribute('aria-hidden');
  menuBtn?.setAttribute('aria-expanded', String(show));
  if (scrim) scrim.hidden = !show;
  document.body.style.overflow = show ? 'hidden' : '';
  if (show && !wasOpen) $('#railClose')?.focus({ preventScroll: true });
}

setDrawer(false);
narrowLayout.addEventListener?.('change', () => setDrawer(false));
menuBtn?.addEventListener('click', () => setDrawer(!rail.classList.contains('open')));
$('#railClose')?.addEventListener('click', () => setDrawer(false));
scrim?.addEventListener('click', () => setDrawer(false));
nav.addEventListener('click', (e) => {
  if (e.target.closest('a') && narrowLayout.matches) setDrawer(false);
});

document.addEventListener('keydown', (e) => {
  if (!rail.classList.contains('open') || !narrowLayout.matches || !$('#palette').hidden) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    setDrawer(false);
    return;
  }
  if (e.key !== 'Tab') return;
  const focusable = $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', rail)
    .filter((el) => el.getClientRects().length);
  if (!focusable.length) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!rail.contains(document.activeElement) || (e.shiftKey && document.activeElement === first)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

/* ==========================================================================
   recent tools
   ========================================================================== */
function pushRecent(id) {
  const list = store.get('pd-recent', []).filter((r) => r.id !== id);
  list.unshift({ id, at: Date.now() });
  store.set('pd-recent', list.slice(0, 4));
}

const recentOf = () => store.get('pd-recent', []).filter((r) => toolById(r.id));

/* ==========================================================================
   blog views
   ========================================================================== */
function postCard(p) {
  return `<article class="post-card">
    <div class="post-card-top">
      <time>${fmtDate(p.date)}</time>
      <span class="post-card-min">${p.minutes} 分钟</span>
    </div>
    <h3><a class="post-card-link" href="${postHref(p.slug)}">${esc(p.title)}</a></h3>
    <p>${esc(p.summary)}</p>
    <div class="post-card-foot">${(p.tags || []).slice(0, 3).map(tagLink).join('')}</div>
  </article>`;
}

function postRow(p) {
  return `<a class="post-row" href="${postHref(p.slug)}">
    <time class="post-row-date">${fmtDate(p.date)}</time>
    <div class="post-row-main">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.summary)}</p>
    </div>
    <span class="post-row-arrow">${icon('arrowRight')}</span>
  </a>`;
}

function featuredArticle(post, index) {
  return `<a class="featured-article" href="${postHref(post.slug)}">
    <span class="featured-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
    <span class="featured-copy"><strong>${esc(post.title)}</strong><small>${esc((post.tags || []).slice(0, 2).join(' · '))}</small></span>
    ${icon('arrowRight')}
  </a>`;
}

function homeMarkup() {
  const latest = postsCache.slice(0, 4);
  const featured = postsCache.filter((post) => post.featured).slice(0, 3);
  const toolChips = TOOLS.slice(0, 6);
  return `
    <section class="blog-hero">
      <img class="blog-avatar" src="${profile.avatar}" alt="${esc(profile.name)}" width="76" height="76" />
      <div class="blog-hero-copy">
        <span class="eyebrow"><span class="pulse"></span>${greeting()}，欢迎来坐坐</span>
        <h1>我是 ${esc(profile.name)}，写点调试笔记，<br class="br" />也做一些顺手的工具。</h1>
        <p>机器人感知方向的一线开发者。这里放那些「查了很久才想明白」的事：点云与配准、推理部署、工程习惯，以及一个装了 13 件小工具的箱子。</p>
        <div class="hero-links">
          <a class="btn btn-primary" href="#/posts">${icon('text')}读文章</a>
          <a class="btn" href="#/tools">${icon('grid')}逛工具箱</a>
          <a class="btn btn-ghost" href="${profile.html_url}" target="_blank" rel="noreferrer">${icon('github')}GitHub</a>
          <a class="btn btn-ghost" href="#/about">关于我${icon('arrowRight')}</a>
        </div>
      </div>
    </section>

    ${featured.length ? `<div class="section-head"><h2>精选文章</h2><span class="section-link">从这里开始</span></div>
    <div class="featured-grid">${featured.map(featuredArticle).join('')}</div>` : ''}

    <div class="section-head">
      <h2>最新文章</h2>
      <a class="section-link" href="#/posts">全部文章 ${icon('arrowRight')}</a>
    </div>
    <div class="post-grid">${latest.map(postCard).join('')}</div>

    <div class="section-head">
      <h2>工具箱</h2>
      <a class="section-link" href="#/tools">全部 ${TOOLS.length} 件 ${icon('arrowRight')}</a>
    </div>
    <div class="tool-chips">
      ${toolChips
        .map((t) => `<a class="tool-chip" href="#/tools/${t.id}">${icon(t.icon)}<span>${esc(t.name)}</span></a>`)
        .join('')}
      <a class="tool-chip more" href="#/tools">还有 7 件 ${icon('arrowRight')}</a>
    </div>`;
}

function postsMarkup(tag) {
  const list = tag ? postsCache.filter((p) => (p.tags || []).includes(tag)) : postsCache;
  const counts = new Map();
  postsCache.forEach((p) => (p.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  const primary = ['点云', 'RGBD', 'YOLO', '工程方法', '调试'].filter((t) => counts.has(t));
  if (tag && counts.has(tag) && !primary.includes(tag)) primary.push(tag);
  const remaining = tags.filter((t) => !primary.includes(t));
  const filterLink = (t) => `<a class="filter-chip" href="#/posts/${encodeURIComponent(t)}"${t === tag ? ' aria-current="page"' : ''}>${esc(t)}</a>`;
  return `
    <header class="page-head">
      <span class="page-kicker">${list.length} 篇</span>
      <h1>${tag ? esc(tag) : '全部文章'}</h1>
      <p>${tag ? `带「${esc(tag)}」标签的文章。` : '按时间倒序。每一篇都来自一次真实的调试。'}</p>
    </header>

    <nav class="tag-filter" aria-label="按文章标签筛选">
      <a class="filter-chip" href="#/posts"${!tag ? ' aria-current="page"' : ''}>全部</a>
      ${primary.map(filterLink).join('')}
      ${remaining.length ? `<details class="tag-more"><summary class="filter-chip">更多标签（${remaining.length}）</summary><div class="tag-filter-extra">${remaining.map(filterLink).join('')}</div></details>` : ''}
    </nav>

    <div class="post-rows">
      ${list.length ? list.map(postRow).join('') : '<div class="empty-note">这个标签下还没有文章</div>'}
    </div>`;
}

async function postMarkup(slug) {
  let post = null;
  try {
    post = await loadPost(slug);
  } catch {
    post = null;
  }
  if (!post) {
    return `<div class="empty-note" style="margin-top:60px">找不到这篇文章。<a href="#/posts">回到全部文章</a></div>`;
  }
  const list = postsCache;
  const idx = list.findIndex((p) => p.slug === slug);
  const newer = list[idx - 1];
  const older = list[idx + 1];
  return `
    <div class="post-wrap">
    <a class="backlink" href="${archiveHref}">${icon('arrowLeft')}全部文章</a>
    <article class="post">
      <header class="post-head">
        <h1>${esc(post.title)}</h1>
        <div class="post-meta">
          <time>${fmtDate(post.date)}</time>
          <span class="dot"></span>
          <span>${post.minutes} 分钟</span>
          <span class="dot"></span>
          <span class="post-meta-tags">${(post.tags || []).map(tagLink).join('')}</span>
        </div>
      </header>
      <div class="post-body">${post.html}</div>
      <footer class="post-foot">
        <div class="post-nav">
          ${older ? `<a class="post-nav-item" href="${postHref(older.slug)}"><span>上一篇</span><strong>${esc(older.title)}</strong></a>` : ''}
          ${newer ? `<a class="post-nav-item next" href="${postHref(newer.slug)}"><span>下一篇</span><strong>${esc(newer.title)}</strong></a>` : ''}
        </div>
      </footer>
    </article>
    </div>`;
}

async function aboutMarkup() {
  await Promise.all([loadRepos(), profileReady]);
  return `
    <div class="post-wrap">
    <header class="page-head">
      <span class="page-kicker">关于</span>
      <h1>${esc(profile.name)}</h1>
      <p>机器人感知方向的一线开发者，长期在做 RGBD、点云配准与实时推理的落地。</p>
    </header>

    <article class="post about">
      <div class="post-body">
        <h2>我在做什么</h2>
        <p>白天处理相机、点云、位姿和实时推理：让一条感知链路在真机上稳定跑起来，而不是只在 demo 里跑通。晚上会把当天卡住的地方写下来——写的过程中经常发现，真正的问题和一开始以为的不是同一个。</p>

        <h2>这个站点</h2>
        <p>它有两部分：</p>
        <ul>
          <li><strong>文章</strong>：调试复盘、工程方法，以及和 AI 结对写代码时踩过的坑。</li>
          <li><strong>工具箱</strong>：13 件日常会用到的本地工具，包括视频转码、JSON、时间戳、哈希、颜色、单位换算等。全部在浏览器里运行，不上传任何数据。</li>
        </ul>

        <h2>写作原则</h2>
        <p>尽量写清楚四件事：<strong>现象</strong>、<strong>原因</strong>、<strong>怎么确认</strong>、<strong>哪一层还没验证</strong>。不把猜测写成结论，也不把「本地通过」说成「已经上线」。</p>

        <h2>技术栈</h2>
        <p>C++ / Python，ROS 2，OpenCV，PCL，ONNX Runtime，CUDA，以及一套自己攒的 Web 小工具。这个站点是纯静态的：没有框架、没有服务端，文章预先生成 HTML。</p>

        <h2>开源</h2>
        <ul class="repo-list">
          ${reposCache
            .map(
              (r) => `<li class="repo-item">
                <a class="repo-name" href="${r.url}" target="_blank" rel="noreferrer">${esc(r.name)}</a>
                <span class="repo-lang">${esc(r.lang || '')}</span>
                ${r.fork ? '<span class="repo-fork">fork</span>' : ''}
                ${r.desc ? `<p class="repo-desc">${esc(r.desc)}</p>` : ''}
              </li>`
            )
            .join('')}
        </ul>
        <p><a href="${profile.html_url}?tab=repositories" target="_blank" rel="noreferrer">在 GitHub 上看全部仓库 →</a></p>

        <h2>联系</h2>
        <ul class="link-list">
          <li><a href="${profile.html_url}" target="_blank" rel="noreferrer">${icon('github')}GitHub · @${esc(profile.login)}</a></li>
          <li><a href="#/posts">${icon('text')}站内文章（有问题欢迎在 GitHub 提 issue）</a></li>
        </ul>
      </div>
    </article>
    </div>`;
}

/* ==========================================================================
   tools views
   ========================================================================== */
let activeCat = 'all';

function tileMarkup(tool, featured = false) {
  const cat = catOf(tool.cat);
  return `<a class="tile${featured ? ' tile-featured' : ''}" href="#/tools/${tool.id}" data-tool="${tool.id}" style="--tile-accent:${cat.color}">
    <div class="tile-top">
      <span class="tile-icon">${icon(tool.icon)}</span>
      <span class="tile-go">${icon('chevronRight')}</span>
    </div>
    <div class="tile-body">
      <h3>${esc(tool.name)}</h3>
      <p>${esc(tool.desc)}</p>
    </div>
    ${featured ? `<div class="fmt-strip" aria-hidden="true"><span>MP4</span><span>MOV</span><span>WebM</span><span>GIF</span><span>MP3</span><span>+14</span></div>` : ''}
    ${featured ? `<div class="tile-visual" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => {
      const h = 18 + Math.abs(Math.sin(i * 0.72 + 0.6)) * 74;
      return `<i style="height:${h.toFixed(0)}%;animation-delay:-${(i * 0.13).toFixed(2)}s"></i>`;
    }).join('')}</div>` : ''}
    <div class="tile-foot">
      <span>${cat.name}</span><span class="sep"></span><span>本地处理</span>
    </div>
  </a>`;
}

function gridMarkup() {
  const list = activeCat === 'all' ? TOOLS : TOOLS.filter((t) => t.cat === activeCat);
  const featured = activeCat === 'all' ? TOOLS.find((t) => t.featured) : null;
  const rest = featured ? list.filter((t) => !t.featured) : list;
  if (!list.length) return '<div class="empty-note">这个分类下还没有工具</div>';
  return `${featured ? tileMarkup(featured, true) : ''}${rest.map((t) => tileMarkup(t)).join('')}`;
}

function toolsMarkup() {
  const recent = recentOf();
  return `
    <header class="page-head">
      <span class="page-kicker">${TOOLS.length} 件 · 全部本地运行</span>
      <h1>工具箱</h1>
      <p>都是些「一周用两次、每次都要去搜」的小东西。没有上传，没有账号，关掉页面就什么也不剩。</p>
    </header>

    ${
      recent.length
        ? `<div class="recent"><span class="recent-label">最近用过</span>${recent
            .map((r) => {
              const t = toolById(r.id);
              return `<a class="chip" href="#/tools/${t.id}">${icon(t.icon)}${esc(t.name)}<span class="muted" style="font-size:10.5px">${relTime(r.at)}</span></a>`;
            })
            .join('')}</div>`
        : ''
    }

    <div class="filters">
      <div class="filter-row" role="group" aria-label="按分类筛选">
        <button class="filter-chip" type="button" data-filter="all" aria-pressed="${activeCat === 'all'}">全部</button>
        ${CATEGORIES.map(
          (c) => `<button class="filter-chip" type="button" data-filter="${c.id}" aria-pressed="${activeCat === c.id}">${c.name}</button>`
        ).join('')}
      </div>
      <span class="count" id="gridCount">${TOOLS.length} 件 / ${CATEGORIES.length} 类</span>
    </div>
    <div class="tool-grid" id="toolGrid">${gridMarkup()}</div>`;
}

function toolMarkup(tool) {
  const cat = catOf(tool.cat);
  return `
    <a class="backlink" href="#/tools">${icon('arrowLeft')}工具箱</a>
    <header class="tool-head" style="--tile-accent:${cat.color}">
      <span class="icon-chip">${icon(tool.icon)}</span>
      <div class="tool-head-copy">
        <h1>${esc(tool.name)}</h1>
        <p class="tool-sub">${esc(tool.sub)}</p>
      </div>
      <div class="tool-pills">
        <span class="pill">${cat.name}</span>
        <span class="pill accent">${icon('shield')}本地处理</span>
      </div>
    </header>
    <div class="tool-mount" id="toolMount"></div>
    <div class="related">
      <div class="related-head">换个工具</div>
      <div class="related-list">
        ${TOOLS.filter((t) => t.id !== tool.id)
          .sort((a, b) => Number(b.cat === tool.cat) - Number(a.cat === tool.cat))
          .slice(0, 5)
          .map((t) => `<a class="chip" href="#/tools/${t.id}">${icon(t.icon)}${esc(t.name)}</a>`)
          .join('')}
      </div>
    </div>`;
}

/* ==========================================================================
   router
   ========================================================================== */
const view = $('#view');
wireCodeCopy(view);
let cleanup = null;
let token = 0;

function isRouteHash(hash) {
  if (!hash) return false;
  const fragment = hash.replace(/^#\/?/, '');
  return hash.startsWith('#/') || /^(?:post|posts|tools)(?:\/|$)/.test(fragment) || fragment === 'about' || Boolean(toolById(fragment));
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!isRouteHash(location.hash)) {
    if (staticPostSlug) return { name: 'post', slug: staticPostSlug, static: true };
    if (staticArchive) return { name: 'posts', static: true };
    return !hash || hash === 'view' ? { name: 'home' } : { name: 'notfound' };
  }
  if (!hash) return { name: 'home' };
  if (hash === 'posts') return { name: 'posts' };
  try {
    if (hash.startsWith('posts/')) return { name: 'posts', tag: decodeURIComponent(hash.slice(6)) };
    if (hash.startsWith('post/')) return { name: 'post', slug: decodeURIComponent(hash.slice(5)), legacyPost: true };
  } catch {
    return { name: 'notfound' };
  }
  if (hash === 'tools') return { name: 'tools' };
  if (hash.startsWith('tools/')) return { name: 'tool', id: hash.slice(6) };
  if (hash === 'about') return { name: 'about' };
  if (toolById(hash)) return { name: 'tool', id: hash, legacy: true };
  return { name: 'notfound' };
}

function setActiveNav(name, extra) {
  $$('[data-nav]').forEach((a) => {
    const id = a.dataset.nav;
    const on =
      (name === 'home' && id === 'home') ||
      ((name === 'posts' || name === 'post') && id === 'posts') ||
      ((name === 'tools' || name === 'tool') && id === 'tools') ||
      (name === 'about' && id === 'about');
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $$('.nav-post').forEach((a) => {
    if (extra?.slug && a.dataset.slug === extra.slug) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function render() {
  const my = ++token;
  const route = parseRoute();

  // Old article hashes become real URLs so sharing and reloading use the
  // article's own HTML and metadata. Unknown slugs keep the old not-found UI.
  if (route.legacyPost) {
    try {
      const posts = await loadPosts();
      if (my !== token) return;
      if (posts.some((post) => post.slug === route.slug)) {
        location.replace(postHref(route.slug));
        return;
      }
    } catch {
      if (my !== token) return;
    }
    if (staticPostSlug || staticArchive) {
      location.replace(rootHashUrl(`#/post/${encodeURIComponent(route.slug)}`));
      return;
    }
  }

  // Hash routes belong to the root app, even if a visitor appends one to a
  // static page. Ordinary document anchors stay on that article.
  if ((staticPostSlug || staticArchive) && isRouteHash(location.hash)) {
    const hash = route.legacy ? `#/tools/${route.id}` : location.hash.startsWith('#/') ? location.hash : `#/${location.hash.slice(1)}`;
    location.replace(rootHashUrl(hash));
    return;
  }
  if (route.legacy) {
    location.replace(rootHashUrl(`#/tools/${route.id}`));
    return;
  }

  if (cleanup) {
    try { cleanup(); } catch { /* noop */ }
    cleanup = null;
  }

  setActiveNav(route.name, route);

  // The server-rendered article is already the complete view. Retain it even
  // if an index/Markdown request fails; only enhance its existing controls.
  if (route.name === 'post' && route.static) return;

  if (route.name !== 'tool') {
    view.innerHTML = '<div class="loading">加载中…</div>';
  }

  window.scrollTo({ top: 0, behavior: 'auto' });

  try {
    if (route.name === 'home') {
      await Promise.all([loadPosts(), profileReady]);
      if (my !== token) return;
      view.innerHTML = homeMarkup();
      document.title = 'wlixill · 笔记与工具';
    } else if (route.name === 'posts') {
      await loadPosts();
      if (my !== token) return;
      view.innerHTML = postsMarkup(route.tag);
      document.title = `${route.tag ? route.tag : '全部文章'} · wlixill`;
    } else if (route.name === 'post') {
      const html = await postMarkup(route.slug);
      if (my !== token) return;
      view.innerHTML = html;
      document.title = `${view.querySelector('.post-head h1')?.textContent || '文章'} · wlixill`;
    } else if (route.name === 'tools') {
      view.innerHTML = toolsMarkup();
      document.title = '工具箱 · wlixill';
    } else if (route.name === 'tool') {
      const tool = toolById(route.id);
      if (!tool) {
        view.innerHTML = `<div class="empty-note" style="margin-top:60px">没有这个工具。<a href="#/tools">回到工具箱</a></div>`;
        return;
      }
      view.innerHTML = toolMarkup(tool);
      document.title = `${tool.name} · wlixill`;
      pushRecent(tool.id);
      const mountEl = $('#toolMount', view);
      try {
        const result = await tool.mount(mountEl);
        if (my !== token) {
          if (typeof result === 'function') result();
          return;
        }
        if (typeof result === 'function') cleanup = result;
      } catch (err) {
        if (my !== token) return;
        mountEl.innerHTML = `<div class="panel"><div class="panel-body"><div class="alert">${icon('alert')}<span>这个工具没能加载：${esc(err?.message || err)}</span></div></div></div>`;
      }
    } else if (route.name === 'about') {
      view.innerHTML = await aboutMarkup();
      document.title = '关于 · wlixill';
    } else {
      view.innerHTML = `<div class="empty-note" style="margin-top:60px">页面不存在。<a href="#/">回到首页</a></div>`;
      document.title = '页面不存在 · wlixill';
    }
  } catch (err) {
    if (my !== token) return;
    view.innerHTML = `<div class="panel" style="margin-top:40px"><div class="panel-body"><div class="alert">${icon('alert')}<span>加载失败：${esc(err?.message || err)}</span></div></div></div>`;
  }

  if (my === token) view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => {
  if (location.hash && !isRouteHash(location.hash) && (staticPostSlug || staticArchive || location.hash === '#view')) return;
  render();
});

view.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (chip && chip.tagName === 'BUTTON') {
    activeCat = chip.getAttribute('data-filter');
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === chip)));
    const grid = $('#toolGrid');
    if (grid) grid.innerHTML = gridMarkup();
    const count = $('#gridCount');
    if (count) {
      const n = activeCat === 'all' ? TOOLS.length : TOOLS.filter((t) => t.cat === activeCat).length;
      count.textContent = `${n} 件 / ${activeCat === 'all' ? CATEGORIES.length : 1} 类`;
    }
    return;
  }
  if (e.target.closest('[data-search]')) openPalette();
});

/* ==========================================================================
   command palette
   ========================================================================== */
const palette = $('#palette');
const paletteInput = $('#paletteInput');
const paletteList = $('#paletteList');
let entries = [];
let filtered = [];
let active = 0;
let lastFocus = null;

function refreshPaletteData() {
  entries = [
    ...postsCache.map((p) => ({
      type: 'post',
      id: p.slug,
      title: p.title,
      meta: fmtDate(p.date),
      icon: 'text',
      href: postHref(p.slug),
      hay: [p.title, p.summary, ...(p.tags || []), p.searchText || ''].join(' '),
    })),
    ...TOOLS.map((t) => ({
      type: 'tool',
      id: t.id,
      title: t.name,
      meta: catOf(t.cat).name,
      icon: t.icon,
      href: `#/tools/${t.id}`,
      hay: [t.name, t.desc, ...(t.tags || [])].join(' '),
    })),
    ...MAIN_NAV.map((n) => ({
      type: 'page',
      id: n.id,
      title: n.label,
      meta: '页面',
      icon: n.icon,
      href: n.href,
      hay: n.label,
    })),
  ];
}

function paletteRow(item, i) {
  return `<a class="palette-item" href="${item.href}" role="option" aria-selected="${i === active}" data-idx="${i}">
    ${icon(item.icon)}<span class="pi-name">${esc(item.title)}</span><span class="pi-cat">${esc(item.meta)}</span>
  </a>`;
}

function paintPalette() {
  paletteList.innerHTML = filtered.length
    ? filtered.map(paletteRow).join('')
    : '<div class="palette-empty">没有匹配的内容，换个关键词试试</div>';
  paletteList.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function filterPalette(q) {
  const key = q.trim().toLowerCase();
  filtered = key ? entries.filter((e) => key.split(/\s+/).every((part) => e.hay.toLowerCase().includes(part))) : entries;
  active = 0;
  paintPalette();
}

function openPalette() {
  lastFocus = document.activeElement;
  if (!entries.length) refreshPaletteData();
  palette.hidden = false;
  paletteInput.value = '';
  filterPalette('');
  requestAnimationFrame(() => paletteInput.focus());
}

function closePalette() {
  palette.hidden = true;
  lastFocus?.focus?.();
}

paletteInput.addEventListener('input', () => filterPalette(paletteInput.value));
paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!filtered.length) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
    paintPalette();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = filtered[active];
    if (item) {
      closePalette();
      location.assign(item.href.startsWith('#') ? rootHashUrl(item.href) : item.href);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
});

paletteList.addEventListener('click', () => closePalette());
palette.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closePalette();
});

[$('#searchTrigger'), $('#mobileSearch')].forEach((btn) => btn?.addEventListener('click', openPalette));

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    palette.hidden ? openPalette() : closePalette();
  } else if (e.key === 'Escape' && !palette.hidden) {
    closePalette();
  } else if (e.key === 'Escape' && parseRoute().name !== 'home' && !e.target.closest('input,textarea,select')) {
    location.assign(rootHashUrl('#/'));
  }
});

/* boot */
refreshPaletteData();
render();
