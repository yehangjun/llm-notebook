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
    appSubtitle: '用于邮箱验证码与 SSO 登录、信息流、收藏和笔记的最小前端。',
    uiLangLabel: '界面语言',
    loginTitle: '登录',
    emailPlaceholder: '邮箱（例如 demo@example.com）',
    sendCode: '发送验证码',
    emailCodePlaceholder: '邮箱验证码',
    verifyLogin: '验证并登录',
    logout: '退出登录',
    ssoLabel: 'SSO（模拟）',
    ssoSubjectPlaceholder: 'SSO Subject ID',
    ssoEmailPlaceholder: 'SSO 邮箱（可选）',
    ssoLogin: 'SSO 登录',
    ssoSubjectRequired: '请输入 SSO Subject ID',
    notLoggedIn: '未登录',
    codeSent: '验证码已发送',
    debugCode: '开发验证码',
    emailCodeRequired: '请输入邮箱和验证码',
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
    emailRequired: '请输入邮箱',
    loginFailed: '登录失败',
    sendCodeFailed: '发送验证码失败',
    ssoLoginFailed: 'SSO 登录失败',
    titleContentRequired: '标题和内容必填',
    noteCreated: '笔记已创建',
    createFailed: '创建失败',
    loggedInAs: '已登录',
    noEmail: '无邮箱',
  },
  en: {
    pageTitle: 'AI Notebook MVP Frontend',
    appTitle: 'AI Notebook MVP Frontend',
    appSubtitle: 'Minimal frontend for email OTP/SSO login, feed, bookmarks, and notes.',
    uiLangLabel: 'UI Language',
    loginTitle: 'Login',
    emailPlaceholder: 'Email (e.g. demo@example.com)',
    sendCode: 'Send Code',
    emailCodePlaceholder: 'Email Code',
    verifyLogin: 'Verify Login',
    logout: 'Logout',
    ssoLabel: 'SSO (Mock)',
    ssoSubjectPlaceholder: 'SSO Subject ID',
    ssoEmailPlaceholder: 'Email for SSO (optional)',
    ssoLogin: 'SSO Login',
    ssoSubjectRequired: 'SSO Subject ID is required',
    notLoggedIn: 'Not logged in',
    codeSent: 'Verification code sent',
    debugCode: 'Dev code',
    emailCodeRequired: 'Email and code are required',
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
    emailRequired: 'Email is required',
    loginFailed: 'Login failed',
    sendCodeFailed: 'Send code failed',
    ssoLoginFailed: 'SSO login failed',
    titleContentRequired: 'Title and content are required',
    noteCreated: 'Note created',
    createFailed: 'Create failed',
    loggedInAs: 'Logged in as',
    noEmail: 'no email',
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
  const email = me.email || t('noEmail');
  return `${t('loggedInAs')} ${me.display_name} (${email})`;
}

const el = {
  uiLang: document.getElementById('uiLang'),
  appTitle: document.getElementById('appTitle'),
  appSubtitle: document.getElementById('appSubtitle'),
  uiLangLabel: document.getElementById('uiLangLabel'),
  loginTitle: document.getElementById('loginTitle'),
  email: document.getElementById('email'),
  sendCodeBtn: document.getElementById('sendCodeBtn'),
  emailCode: document.getElementById('emailCode'),
  verifyCodeBtn: document.getElementById('verifyCodeBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  ssoLabel: document.getElementById('ssoLabel'),
  ssoProvider: document.getElementById('ssoProvider'),
  ssoSubject: document.getElementById('ssoSubject'),
  ssoEmail: document.getElementById('ssoEmail'),
  ssoLoginBtn: document.getElementById('ssoLoginBtn'),
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
  el.email.placeholder = t('emailPlaceholder');
  el.sendCodeBtn.textContent = t('sendCode');
  el.emailCode.placeholder = t('emailCodePlaceholder');
  el.verifyCodeBtn.textContent = t('verifyLogin');
  el.logoutBtn.textContent = t('logout');
  el.ssoLabel.textContent = t('ssoLabel');
  el.ssoSubject.placeholder = t('ssoSubjectPlaceholder');
  el.ssoEmail.placeholder = t('ssoEmailPlaceholder');
  el.ssoLoginBtn.textContent = t('ssoLogin');

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

async function sendEmailCode() {
  const email = el.email.value.trim();
  if (!email) {
    setStatus(el.loginStatus, t('emailRequired'), false);
    return;
  }

  try {
    const out = await api('/auth/email/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    let msg = `${t('codeSent')}`;
    if (out.debug_code) {
      msg = `${msg} (${t('debugCode')}: ${out.debug_code})`;
      el.emailCode.value = out.debug_code;
    }
    setStatus(el.loginStatus, msg, true);
  } catch (err) {
    setStatus(el.loginStatus, `${t('sendCodeFailed')}: ${err.message}`, false);
  }
}

async function verifyEmailCodeLogin() {
  const email = el.email.value.trim();
  const code = el.emailCode.value.trim();
  if (!email || !code) {
    setStatus(el.loginStatus, t('emailCodeRequired'), false);
    return;
  }

  try {
    const out = await api('/auth/email/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    state.token = out.access_token;
    localStorage.setItem(tokenKey, state.token);
    await refreshMe();
    await Promise.all([loadBookmarks(), loadNotes()]);
  } catch (err) {
    setStatus(el.loginStatus, `${t('loginFailed')}: ${err.message}`, false);
  }
}

async function mockSsoLogin() {
  const provider = el.ssoProvider.value;
  const provider_user_id = el.ssoSubject.value.trim();
  const email = el.ssoEmail.value.trim() || el.email.value.trim() || null;

  if (!provider_user_id) {
    setStatus(el.loginStatus, t('ssoSubjectRequired'), false);
    return;
  }

  try {
    const out = await api('/auth/sso/mock-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, provider_user_id, email }),
    });
    state.token = out.access_token;
    localStorage.setItem(tokenKey, state.token);
    await refreshMe();
    await Promise.all([loadBookmarks(), loadNotes()]);
  } catch (err) {
    setStatus(el.loginStatus, `${t('ssoLoginFailed')}: ${err.message}`, false);
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
  el.sendCodeBtn.onclick = sendEmailCode;
  el.verifyCodeBtn.onclick = verifyEmailCodeLogin;
  el.ssoLoginBtn.onclick = mockSsoLogin;
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
