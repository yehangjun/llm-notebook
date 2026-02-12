const tokenKey = 'mvp_token';
const uiLangKey = 'mvp_ui_lang';

const savedUiLang = localStorage.getItem(uiLangKey);
const browserUiLang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';

const state = {
  token: localStorage.getItem(tokenKey) || '',
  uiLang: savedUiLang === 'zh' || savedUiLang === 'en' ? savedUiLang : browserUiLang,
};

const i18n = {
  zh: {
    pageTitle: 'AI Notebook MVP 前端',
    appTitle: 'AI Notebook MVP 前端',
    appSubtitle: '用于开发登录、信息流、收藏和笔记的最小前端。',
    uiLangLabel: '界面语言',
    loginTitle: '登录',
    phonePlaceholder: '手机号（例如 13800138000）',
    devLogin: '开发登录',
    logout: '退出登录',
    notLoggedIn: '未登录',
    feedTitle: '信息流',
    all: '全部',
    english: '英文',
    chinese: '中文',
    reloadFeed: '刷新信息流',
    bookmarksTitle: '我的收藏',
    reload: '刷新',
    createNoteTitle: '创建笔记',
    articleIdPlaceholder: '文章 ID（可选）',
    noteTitlePlaceholder: '笔记标题',
    noteContentPlaceholder: '输入笔记内容...',
    noteTagsPlaceholder: '标签（逗号分隔）',
    notePublic: '公开',
    createNote: '创建笔记',
    notesTitle: '我的笔记',
    noItems: '暂无内容',
    source: '来源',
    useInNote: '用于笔记',
    bookmark: '收藏',
    bookmarkFailed: '收藏失败',
    noBookmarks: '暂无收藏',
    openSource: '打开来源',
    noNotes: '暂无笔记',
    publicLabel: '公开',
    privateLabel: '私密',
    loginRequired: '需要先登录',
    tokenInvalid: '登录已失效，请重新登录',
    phoneRequired: '请输入手机号',
    loginFailed: '登录失败',
    titleContentRequired: '标题和内容必填',
    noteCreated: '笔记已创建',
    createFailed: '创建失败',
    loggedInAs: '已登录',
  },
  en: {
    pageTitle: 'AI Notebook MVP Frontend',
    appTitle: 'AI Notebook MVP Frontend',
    appSubtitle: 'Minimal frontend for dev login, feed, bookmarks, and notes.',
    uiLangLabel: 'UI Language',
    loginTitle: 'Login',
    phonePlaceholder: 'Phone (e.g. 13800138000)',
    devLogin: 'Dev Login',
    logout: 'Logout',
    notLoggedIn: 'Not logged in',
    feedTitle: 'Feed',
    all: 'All',
    english: 'English',
    chinese: 'Chinese',
    reloadFeed: 'Reload Feed',
    bookmarksTitle: 'My Bookmarks',
    reload: 'Reload',
    createNoteTitle: 'Create Note',
    articleIdPlaceholder: 'Article ID (optional)',
    noteTitlePlaceholder: 'Note title',
    noteContentPlaceholder: 'Write note content...',
    noteTagsPlaceholder: 'Tags (comma separated)',
    notePublic: 'public',
    createNote: 'Create Note',
    notesTitle: 'My Notes',
    noItems: 'No items',
    source: 'source',
    useInNote: 'Use in Note',
    bookmark: 'Bookmark',
    bookmarkFailed: 'Bookmark failed',
    noBookmarks: 'No bookmarks',
    openSource: 'open source',
    noNotes: 'No notes',
    publicLabel: 'public',
    privateLabel: 'private',
    loginRequired: 'Login required',
    tokenInvalid: 'Token invalid, please login again',
    phoneRequired: 'Phone is required',
    loginFailed: 'Login failed',
    titleContentRequired: 'Title and content are required',
    noteCreated: 'Note created',
    createFailed: 'Create failed',
    loggedInAs: 'Logged in as',
  },
};

function t(key) {
  return i18n[state.uiLang][key] || i18n.en[key] || key;
}

function formatDate(isoDate) {
  const locale = state.uiLang === 'zh' ? 'zh-CN' : 'en-US';
  return new Date(isoDate).toLocaleString(locale);
}

function loggedInText(me) {
  return `${t('loggedInAs')} ${me.display_name} (${me.phone})`;
}

const el = {
  uiLang: document.getElementById('uiLang'),
  appTitle: document.getElementById('appTitle'),
  appSubtitle: document.getElementById('appSubtitle'),
  uiLangLabel: document.getElementById('uiLangLabel'),
  loginTitle: document.getElementById('loginTitle'),
  phone: document.getElementById('phone'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  loginStatus: document.getElementById('loginStatus'),
  feedTitle: document.getElementById('feedTitle'),
  lang: document.getElementById('lang'),
  loadFeedBtn: document.getElementById('loadFeedBtn'),
  feed: document.getElementById('feed'),
  bookmarksTitle: document.getElementById('bookmarksTitle'),
  loadBookmarksBtn: document.getElementById('loadBookmarksBtn'),
  bookmarks: document.getElementById('bookmarks'),
  createNoteTitle: document.getElementById('createNoteTitle'),
  noteArticleId: document.getElementById('noteArticleId'),
  noteTitle: document.getElementById('noteTitle'),
  noteContent: document.getElementById('noteContent'),
  noteTags: document.getElementById('noteTags'),
  notePublic: document.getElementById('notePublic'),
  notePublicText: document.getElementById('notePublicText'),
  createNoteBtn: document.getElementById('createNoteBtn'),
  noteStatus: document.getElementById('noteStatus'),
  notesTitle: document.getElementById('notesTitle'),
  loadNotesBtn: document.getElementById('loadNotesBtn'),
  notes: document.getElementById('notes'),
};

async function api(path, options = {}, withAuth = false) {
  const headers = options.headers ? { ...options.headers } : {};
  if (withAuth && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  return null;
}

function setStatus(node, text, ok = true) {
  node.textContent = text;
  node.className = `status ${ok ? 'ok' : 'err'}`;
}

function setMutedStatus(node, text) {
  node.textContent = text;
  node.className = 'status muted';
}

function applyTranslations() {
  document.documentElement.lang = state.uiLang;
  document.title = t('pageTitle');

  el.appTitle.textContent = t('appTitle');
  el.appSubtitle.textContent = t('appSubtitle');
  el.uiLangLabel.textContent = t('uiLangLabel');

  el.loginTitle.textContent = t('loginTitle');
  el.phone.placeholder = t('phonePlaceholder');
  el.loginBtn.textContent = t('devLogin');
  el.logoutBtn.textContent = t('logout');

  el.feedTitle.textContent = t('feedTitle');
  const currentFeedLang = el.lang.value;
  el.lang.innerHTML = [
    `<option value="">${t('all')}</option>`,
    `<option value="en">${t('english')}</option>`,
    `<option value="zh">${t('chinese')}</option>`,
  ].join('');
  if (currentFeedLang === 'en' || currentFeedLang === 'zh') {
    el.lang.value = currentFeedLang;
  }
  el.loadFeedBtn.textContent = t('reloadFeed');

  el.bookmarksTitle.textContent = t('bookmarksTitle');
  el.loadBookmarksBtn.textContent = t('reload');

  el.createNoteTitle.textContent = t('createNoteTitle');
  el.noteArticleId.placeholder = t('articleIdPlaceholder');
  el.noteTitle.placeholder = t('noteTitlePlaceholder');
  el.noteContent.placeholder = t('noteContentPlaceholder');
  el.noteTags.placeholder = t('noteTagsPlaceholder');
  el.notePublicText.textContent = t('notePublic');
  el.createNoteBtn.textContent = t('createNote');

  el.notesTitle.textContent = t('notesTitle');
  el.loadNotesBtn.textContent = t('reload');

  if (!state.token) {
    setMutedStatus(el.loginStatus, t('notLoggedIn'));
  }
}

function renderFeed(items) {
  el.feed.innerHTML = '';
  if (!items.length) {
    el.feed.innerHTML = `<p class="muted">${t('noItems')}</p>`;
    return;
  }

  items.forEach((a) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <h3>${a.title}</h3>
      <p>${a.summary || ''}</p>
      <div class="row">
        <a href="${a.url}" target="_blank" rel="noreferrer">${t('source')}</a>
        <span class="muted">${a.language} | ${formatDate(a.published_at)}</span>
        <span class="spacer"></span>
        <button class="secondary">${t('useInNote')}</button>
        <button>${t('bookmark')}</button>
      </div>
    `;

    const useBtn = item.querySelectorAll('button')[0];
    const bookmarkBtn = item.querySelectorAll('button')[1];

    useBtn.onclick = () => {
      el.noteArticleId.value = a.id;
      if (!el.noteTitle.value) {
        el.noteTitle.value = a.title;
      }
      el.noteContent.focus();
    };

    bookmarkBtn.onclick = async () => {
      if (!state.token) {
        alert(t('loginRequired'));
        return;
      }

      try {
        await api(`/bookmarks/${a.id}`, { method: 'POST' }, true);
        await loadBookmarks();
      } catch (err) {
        alert(`${t('bookmarkFailed')}: ${err.message}`);
      }
    };

    el.feed.appendChild(item);
  });
}

function renderBookmarks(items) {
  el.bookmarks.innerHTML = '';
  if (!items.length) {
    el.bookmarks.innerHTML = `<p class="muted">${t('noBookmarks')}</p>`;
    return;
  }

  items.forEach((a) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <h3>${a.title}</h3>
      <p class="muted">${a.language}</p>
      <a href="${a.url}" target="_blank" rel="noreferrer">${t('openSource')}</a>
    `;
    el.bookmarks.appendChild(item);
  });
}

function renderNotes(items) {
  el.notes.innerHTML = '';
  if (!items.length) {
    el.notes.innerHTML = `<p class="muted">${t('noNotes')}</p>`;
    return;
  }

  items.forEach((n) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <h3>${n.title}</h3>
      <p>${n.content}</p>
      <p class="muted">${n.is_public ? t('publicLabel') : t('privateLabel')} | ${formatDate(n.updated_at)}</p>
    `;
    el.notes.appendChild(item);
  });
}

async function loadFeed() {
  const lang = el.lang.value;
  const q = lang ? `?language=${encodeURIComponent(lang)}` : '';
  const data = await api(`/feed${q}`);
  renderFeed(data);
}

async function loadBookmarks() {
  if (!state.token) {
    el.bookmarks.innerHTML = `<p class="muted">${t('loginRequired')}</p>`;
    return;
  }

  const data = await api('/bookmarks', {}, true);
  renderBookmarks(data);
}

async function loadNotes() {
  if (!state.token) {
    el.notes.innerHTML = `<p class="muted">${t('loginRequired')}</p>`;
    return;
  }

  const data = await api('/notes/me', {}, true);
  renderNotes(data);
}

async function refreshMe() {
  if (!state.token) {
    setMutedStatus(el.loginStatus, t('notLoggedIn'));
    return;
  }

  try {
    const me = await api('/auth/me', {}, true);
    setStatus(el.loginStatus, loggedInText(me), true);
  } catch (_err) {
    state.token = '';
    localStorage.removeItem(tokenKey);
    setStatus(el.loginStatus, t('tokenInvalid'), false);
  }
}

async function doLogin() {
  const phone = el.phone.value.trim();
  if (!phone) {
    setStatus(el.loginStatus, t('phoneRequired'), false);
    return;
  }

  try {
    const out = await api('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    state.token = out.access_token;
    localStorage.setItem(tokenKey, state.token);
    await refreshMe();
    await Promise.all([loadBookmarks(), loadNotes()]);
  } catch (err) {
    setStatus(el.loginStatus, `${t('loginFailed')}: ${err.message}`, false);
  }
}

function doLogout() {
  state.token = '';
  localStorage.removeItem(tokenKey);
  el.bookmarks.innerHTML = `<p class="muted">${t('loginRequired')}</p>`;
  el.notes.innerHTML = `<p class="muted">${t('loginRequired')}</p>`;
  setMutedStatus(el.loginStatus, t('notLoggedIn'));
}

async function createNote() {
  if (!state.token) {
    setStatus(el.noteStatus, t('loginRequired'), false);
    return;
  }

  const title = el.noteTitle.value.trim();
  const content = el.noteContent.value.trim();
  if (!title || !content) {
    setStatus(el.noteStatus, t('titleContentRequired'), false);
    return;
  }

  const payload = {
    article_id: el.noteArticleId.value.trim() || null,
    title,
    content,
    is_public: el.notePublic.checked,
    tags: el.noteTags.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };

  try {
    await api('/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, true);
    setStatus(el.noteStatus, t('noteCreated'), true);
    el.noteTitle.value = '';
    el.noteContent.value = '';
    el.noteTags.value = '';
    await loadNotes();
  } catch (err) {
    setStatus(el.noteStatus, `${t('createFailed')}: ${err.message}`, false);
  }
}

async function onUiLangChange() {
  state.uiLang = el.uiLang.value === 'zh' ? 'zh' : 'en';
  localStorage.setItem(uiLangKey, state.uiLang);
  applyTranslations();

  await Promise.all([
    loadFeed(),
    loadBookmarks(),
    loadNotes(),
    refreshMe(),
  ]);
}

async function boot() {
  el.uiLang.value = state.uiLang;
  applyTranslations();

  el.uiLang.onchange = onUiLangChange;
  el.loginBtn.onclick = doLogin;
  el.logoutBtn.onclick = doLogout;
  el.loadFeedBtn.onclick = loadFeed;
  el.loadBookmarksBtn.onclick = loadBookmarks;
  el.loadNotesBtn.onclick = loadNotes;
  el.createNoteBtn.onclick = createNote;

  await loadFeed();
  await refreshMe();
  await loadBookmarks();
  await loadNotes();
}

boot();
