/* Project data comes from the caller; neither the gallery nor the teasers fetch it. */
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function projectList(repos) {
  if (!Array.isArray(repos)) return [];
  return repos.filter((repo) => repo && typeof repo.name === 'string' && repo.name.length > 0).map((repo) => ({
    name: repo.name,
    lang: typeof repo.lang === 'string' ? repo.lang.trim() : '',
    desc: typeof repo.desc === 'string' && repo.desc.trim() ? repo.desc.trim() : '暂无仓库简介',
    url: typeof repo.url === 'string' ? repo.url : '',
    fork: typeof repo.fork === 'boolean' ? repo.fork : null,
  }));
}

const languageOf = (repo) => repo.lang || '未标注语言';
const numberOf = (index) => String(index + 1).padStart(2, '0');
const projectHref = (name) => `#/projects/${encodeURIComponent(name)}`;

// The decoration is intentionally abstract, not a representation of the project UI.
function artwork(index, language, extraClass = '', name = '') {
  return `<span class="project-art ${extraClass}" data-project-art="${index % 5}">
    <span class="project-art__grid" aria-hidden="true"></span>
    <span class="project-art__layers" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="project-art__nodes" aria-hidden="true"><i class="project-art__wire"></i><i class="project-art__wire"></i><i class="project-art__wire"></i><i class="project-art__wire"></i><i class="project-art__node"></i><i class="project-art__node"></i><i class="project-art__node"></i><i class="project-art__node"></i><i class="project-art__node"></i></span>
    <span class="project-art__focus" aria-hidden="true"><i class="project-art__focus-frame"></i><i class="project-art__focus-pane"></i><i class="project-art__focus-cross"></i><i class="project-art__focus-corner"></i><i class="project-art__focus-corner"></i><i class="project-art__focus-corner"></i><i class="project-art__focus-corner"></i></span>
    <span class="project-art__bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <span class="project-art__controls" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="project-art__stamp">视觉示意</span>
    <span class="project-art__caption" aria-hidden="true"><span class="project-art__caption-name"><span class="project-art__number">${numberOf(index)}</span> / <span class="project-art__name">${escapeHtml(name)}</span></span><span class="project-art__language">${escapeHtml(language)}</span></span>
  </span>`;
}

function cardMarkup(repo, index, teaser = false) {
  const tag = teaser ? 'a' : 'button';
  const action = teaser
    ? `href="${escapeHtml(projectHref(repo.name))}"`
    : `type="button" data-project-open="${escapeHtml(repo.name)}"`;
  return `<${tag} class="project-card" ${action}>
    ${artwork(index, languageOf(repo), 'project-card__art', repo.name)}
    <span class="project-card__body">
      <span class="project-card__heading"><strong class="project-card__name">${escapeHtml(repo.name)}</strong><span class="project-card__arrow" aria-hidden="true">↗</span></span>
      <span class="project-card__description">${escapeHtml(repo.desc)}</span>
      <span class="project-card__meta"><span>${escapeHtml(languageOf(repo))}</span>${repo.fork === true ? '<span>Fork</span>' : ''}<span class="project-card__action">查看详情 <span aria-hidden="true">→</span></span></span>
    </span>
  </${tag}>`;
}

/** A small, link-only gallery suitable for embedding in the home page. */
export function projectTeasers(repos) {
  const items = projectList(repos).slice(0, 3);
  if (!items.length) return '';
  return `<section class="project-teasers" aria-label="项目">
    <div class="project-teasers__head"><div><span class="project-teasers__eyebrow">SELECTED PROJECTS</span><h2>项目</h2></div><a class="project-teasers__more" href="#/projects">查看全部 <span aria-hidden="true">↗</span></a></div>
    <div class="project-teasers__grid">${items.map((repo, index) => cardMarkup(repo, index, true)).join('')}</div>
  </section>`;
}

function safeGithubUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function focusWithoutScroll(element) {
  if (!element || typeof element.focus !== 'function') return;
  try { element.focus({ preventScroll: true }); } catch { element.focus(); }
}

function restoreVisibleFocus(element) {
  if (!element || typeof element.focus !== 'function') return;
  const rect = element.getBoundingClientRect();
  const viewport = element.ownerDocument.defaultView;
  const outside = viewport && (rect.top < 0 || rect.bottom > viewport.innerHeight || rect.left < 0 || rect.right > viewport.innerWidth);
  // Deep links can open a project whose card is far below the viewport. Do
  // not strand keyboard focus off-screen when the dialog closes.
  focusWithoutScroll(element);
  if (outside) element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

/**
 * Render once, then let the caller's router drive the detail with sync(name).
 * Navigation callbacks request route changes; only sync() opens or closes the dialog.
 */
export function mountProjects(view, repos, onNavigate) {
  const doc = view.ownerDocument;
  const items = projectList(repos);
  const categories = [...new Set(items.map(languageOf))];
  const root = doc.createElement('section');
  root.className = 'project-gallery';
  root.innerHTML = `<header class="page-head project-gallery__head">
      <span class="project-gallery__eyebrow">PROJECT ARCHIVE</span>
      <h1>项目</h1>
      <p>一些公开的代码仓库，按语言浏览，打开卡片查看详情。</p>
    </header>
    <div class="project-gallery__toolbar">
      <div class="filter-row" role="group" aria-label="按项目语言筛选">
        <button class="filter-chip" type="button" data-project-filter="all" aria-pressed="true">全部</button>
        ${categories.map((category) => `<button class="filter-chip" type="button" data-project-filter="${escapeHtml(category)}" aria-pressed="false">${escapeHtml(category)}</button>`).join('')}
      </div>
      <span class="project-gallery__count" data-project-count role="status" aria-live="polite"></span>
    </div>
    <ul class="project-grid" aria-label="项目列表">
      ${items.map((repo, index) => `<li class="project-grid__item" data-project-item>${cardMarkup(repo, index)}</li>`).join('')}
    </ul>
    <p class="project-gallery__empty" data-project-empty hidden>暂无项目</p>`;

  const dialog = doc.createElement('dialog');
  dialog.className = 'project-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'project-dialog-title');
  dialog.setAttribute('aria-describedby', 'project-dialog-description');
  dialog.innerHTML = `<div class="project-dialog__panel">
    <div class="project-dialog__top"><span class="project-dialog__eyebrow">PROJECT / REPOSITORY</span><button class="project-dialog__close" type="button" data-project-close aria-label="关闭项目详情"><span aria-hidden="true">×</span></button></div>
    <div class="project-dialog__content">
      ${artwork(0, '', 'project-dialog__art')}
      <div class="project-dialog__copy">
        <div class="project-dialog__index">项目详情 <span aria-hidden="true">/</span> <span data-project-position></span></div>
        <h2 id="project-dialog-title" tabindex="-1" aria-live="polite" aria-atomic="true"></h2>
        <p class="project-dialog__description" id="project-dialog-description"></p>
        <dl class="project-dialog__metadata"><div><dt>语言</dt><dd data-project-language></dd></div><div><dt>仓库类型</dt><dd data-project-fork></dd></div></dl>
        <a class="project-dialog__link" data-project-link target="_blank" rel="noopener noreferrer">在 GitHub 查看 <span aria-hidden="true">↗</span></a>
        <p class="project-dialog__link-note" data-project-link-note hidden>仓库链接不可用</p>
      </div>
    </div>
    <div class="project-dialog__nav" aria-label="项目切换">
      <button class="project-dialog__nav-button" type="button" data-project-prev><span class="project-dialog__nav-arrow" aria-hidden="true">←</span><span><small>上一项目</small><strong data-project-prev-name></strong></span></button>
      <button class="project-dialog__nav-button project-dialog__nav-button--next" type="button" data-project-next><span><small>下一项目</small><strong data-project-next-name></strong></span><span class="project-dialog__nav-arrow" aria-hidden="true">→</span></button>
    </div>
  </div>`;
  root.append(dialog);
  view.replaceChildren(root);

  const filterButtons = [...root.querySelectorAll('[data-project-filter]')];
  const itemNodes = [...root.querySelectorAll('[data-project-item]')];
  const cardButtons = [...root.querySelectorAll('[data-project-open]')];
  const count = root.querySelector('[data-project-count]');
  const empty = root.querySelector('[data-project-empty]');
  const grid = root.querySelector('.project-grid');
  const closeButton = dialog.querySelector('[data-project-close]');
  const previousButton = dialog.querySelector('[data-project-prev]');
  const nextButton = dialog.querySelector('[data-project-next]');
  const previousName = dialog.querySelector('[data-project-prev-name]');
  const nextName = dialog.querySelector('[data-project-next-name]');
  const title = dialog.querySelector('#project-dialog-title');
  const description = dialog.querySelector('#project-dialog-description');
  const language = dialog.querySelector('[data-project-language]');
  const fork = dialog.querySelector('[data-project-fork]');
  const position = dialog.querySelector('[data-project-position]');
  const link = dialog.querySelector('[data-project-link]');
  const linkNote = dialog.querySelector('[data-project-link-note]');
  const detailArt = dialog.querySelector('.project-dialog__art');
  const detailContent = dialog.querySelector('.project-dialog__content');

  let currentName = null;
  let previousTarget = null;
  let nextTarget = null;
  let pendingTrigger = null;
  let returnCard = null;
  let openedFromCard = false;
  let isOpen = false;
  let mode = '';
  let disposed = false;
  let inertChanges = [];

  function applyFilter(selected) {
    let visible = 0;
    const activeButton = selected === null ? filterButtons[0] : filterButtons.find((button, index) => index > 0 && button.getAttribute('data-project-filter') === selected);
    filterButtons.forEach((button) => button.setAttribute('aria-pressed', String(button === activeButton)));
    itemNodes.forEach((node, index) => {
      const matches = selected === null || languageOf(items[index]) === selected;
      node.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = `${visible} / ${items.length} 个项目`;
    empty.hidden = visible !== 0;
    empty.textContent = items.length ? '该分类暂无项目' : '暂无项目';
    grid.classList.remove('is-switching');
    void grid.offsetWidth;
    grid.classList.add('is-switching');
  }

  function cardFor(name) {
    return cardButtons.find((button) => button.getAttribute('data-project-open') === name) || null;
  }

  function renderDetail(name) {
    const index = items.findIndex((repo) => repo.name === name);
    const repo = index >= 0 ? items[index] : null;
    const url = repo ? safeGithubUrl(repo.url) : '';
    title.textContent = repo ? repo.name : '项目未找到';
    description.textContent = repo ? repo.desc : `未在当前仓库列表中找到「${name}」。`;
    language.textContent = repo ? languageOf(repo) : '—';
    fork.textContent = repo ? (repo.fork === null ? '未标注' : repo.fork ? 'Fork' : '非 Fork') : '—';
    position.textContent = index >= 0 ? `${numberOf(index)} / ${String(items.length).padStart(2, '0')}` : `— / ${String(items.length).padStart(2, '0')}`;
    detailArt.dataset.projectArt = String(index >= 0 ? index % 5 : 0);
    detailArt.querySelector('.project-art__number').textContent = index >= 0 ? numberOf(index) : '—';
    detailArt.querySelector('.project-art__name').textContent = repo ? repo.name : '项目未找到';
    detailArt.querySelector('.project-art__language').textContent = repo ? languageOf(repo) : '未找到';

    link.hidden = !url;
    if (url) {
      link.href = url;
      link.setAttribute('aria-label', `在 GitHub 查看 ${repo.name}（在新标签页打开）`);
    } else {
      link.removeAttribute('href');
      link.removeAttribute('aria-label');
    }
    linkNote.hidden = Boolean(url) || !repo;

    const canSwitch = index >= 0 ? items.length > 1 : items.length > 0;
    previousTarget = canSwitch ? items[index < 0 ? items.length - 1 : (index + items.length - 1) % items.length].name : null;
    nextTarget = canSwitch ? items[index < 0 ? 0 : (index + 1) % items.length].name : null;
    previousButton.disabled = previousTarget === null;
    nextButton.disabled = nextTarget === null;
    previousName.textContent = previousTarget === null ? '没有其他项目' : previousTarget;
    nextName.textContent = nextTarget === null ? '没有其他项目' : nextTarget;
    previousButton.setAttribute('aria-label', previousTarget === null ? '没有上一项目' : `上一项目：${previousTarget}`);
    nextButton.setAttribute('aria-label', nextTarget === null ? '没有下一项目' : `下一项目：${nextTarget}`);
  }

  // In the non-modal fallback, move the dialog out of transformed ancestors and
  // inert all background siblings. Preserve existing inert/aria-hidden values.
  function makeBackgroundInert() {
    inertChanges = [];
    for (let child = dialog; child.parentElement; child = child.parentElement) {
      const parent = child.parentElement;
      for (const sibling of parent.children) {
        if (sibling === child) continue;
        const hadInert = sibling.hasAttribute('inert');
        const oldAria = sibling.getAttribute('aria-hidden');
        const changeAria = !('inert' in sibling) && oldAria !== 'true';
        if (!hadInert) sibling.setAttribute('inert', '');
        if (changeAria) sibling.setAttribute('aria-hidden', 'true');
        if (!hadInert || changeAria) inertChanges.push({ sibling, addedInert: !hadInert, changeAria, oldAria });
      }
      if (parent === doc.body) break;
    }
  }

  function restoreBackground() {
    inertChanges.forEach(({ sibling, addedInert, changeAria, oldAria }) => {
      if (addedInert) sibling.removeAttribute('inert');
      if (changeAria) {
        if (oldAria === null) sibling.removeAttribute('aria-hidden');
        else sibling.setAttribute('aria-hidden', oldAria);
      }
    });
    inertChanges = [];
  }

  function openDialog() {
    isOpen = true;
    mode = '';
    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
        if (dialog.open) mode = 'native';
      } catch { /* Older browsers and detached views use the fallback below. */ }
    }
    if (!mode) {
      dialog.classList.add('is-fallback');
      if (doc.body && dialog.parentElement !== doc.body) doc.body.append(dialog);
      dialog.setAttribute('open', '');
      mode = 'fallback';
      focusWithoutScroll(closeButton);
      makeBackgroundInert();
    } else {
      focusWithoutScroll(closeButton);
    }
  }

  function closeDialog(restoreFocus) {
    if (!isOpen && !dialog.hasAttribute('open')) return;
    isOpen = false;
    if (mode === 'native' && typeof dialog.close === 'function' && dialog.open) {
      try { dialog.close(); } catch { dialog.removeAttribute('open'); }
    } else {
      dialog.removeAttribute('open');
    }
    restoreBackground();
    dialog.classList.remove('is-fallback');
    if (dialog.parentElement !== root && root.isConnected) root.append(dialog);
    mode = '';
    if (restoreFocus && root.isConnected) {
      const card = returnCard && root.contains(returnCard) ? returnCard : cardButtons.find((button) => !button.closest('[hidden]'));
      if (card?.closest('[hidden]')) filterButtons[0].click();
      restoreVisibleFocus(card || filterButtons[0]);
    }
    returnCard = null;
    openedFromCard = false;
  }

  function onGalleryClick(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const filter = target.closest('[data-project-filter]');
    if (filter && root.contains(filter)) {
      applyFilter(filter === filterButtons[0] ? null : filter.getAttribute('data-project-filter'));
      return;
    }
    const card = target.closest('[data-project-open]');
    if (card && root.contains(card)) {
      pendingTrigger = card;
      if (typeof onNavigate === 'function') onNavigate(card.getAttribute('data-project-open'));
    }
  }

  function onDialogClick(event) {
    if (event.target === dialog) {
      if (typeof onNavigate === 'function') onNavigate(null);
      return;
    }
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest('[data-project-close]')) {
      if (typeof onNavigate === 'function') onNavigate(null);
    } else if (target.closest('[data-project-prev]') && previousTarget !== null) {
      if (typeof onNavigate === 'function') onNavigate(previousTarget);
    } else if (target.closest('[data-project-next]') && nextTarget !== null) {
      if (typeof onNavigate === 'function') onNavigate(nextTarget);
    }
  }

  function onCancel(event) {
    // Even a platform close request must first go through the router.
    event.preventDefault();
    if (typeof onNavigate === 'function') onNavigate(null);
  }

  function onKeyDown(event) {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      // The shell also handles Escape; intercept it before it can navigate away.
      event.preventDefault();
      event.stopPropagation();
      if (typeof onNavigate === 'function') onNavigate(null);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.closest('[hidden], [inert]') && element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      focusWithoutScroll(title);
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = doc.activeElement;
    if (!dialog.contains(active) || !focusable.includes(active)) {
      event.preventDefault();
      focusWithoutScroll(event.shiftKey ? last : first);
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      focusWithoutScroll(last);
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      focusWithoutScroll(first);
    }
  }

  function onFocusIn(event) {
    if (isOpen && !dialog.contains(event.target)) focusWithoutScroll(closeButton);
  }

  root.addEventListener('click', onGalleryClick);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('cancel', onCancel);
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('focusin', onFocusIn, true);
  applyFilter(null);

  function sync(name) {
    if (disposed) return;
    if (name == null) {
      pendingTrigger = null;
      currentName = null;
      closeDialog(true);
      return;
    }
    const selected = String(name);
    const wasOpen = isOpen;
    const changed = currentName !== selected;
    if (!wasOpen) {
      openedFromCard = Boolean(pendingTrigger && root.contains(pendingTrigger) && pendingTrigger.getAttribute('data-project-open') === selected);
      returnCard = openedFromCard ? pendingTrigger : cardFor(selected);
    } else if (!openedFromCard) {
      returnCard = cardFor(selected);
    }
    pendingTrigger = null;
    currentName = selected;
    renderDetail(selected);
    if (!wasOpen) {
      detailContent.classList.remove('is-changing');
      openDialog();
    } else if (changed) {
      // Restart the transition without replacing the controls or the gallery.
      detailContent.classList.remove('is-changing');
      void detailContent.offsetWidth;
      detailContent.classList.add('is-changing');
    }
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    root.removeEventListener('click', onGalleryClick);
    dialog.removeEventListener('click', onDialogClick);
    dialog.removeEventListener('cancel', onCancel);
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('focusin', onFocusIn, true);
    closeDialog(false);
    restoreBackground();
    dialog.remove();
    root.remove();
  }

  return { sync, destroy };
}
