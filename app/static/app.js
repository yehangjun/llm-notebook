const tokenKey = 'mvp_token';
const uiLangKey = 'mvp_ui_lang';

const i18n = {
  en: {
    appTitle: 'AI Notebook MVP',
    appSubtitle: 'LLM knowledge feed, bookmarks and notes.',
    uiLangLabel: 'Language',
    loginRegister: 'Login / Register',
    feedTitle: 'Feed',
    bookmarksTitle: 'My Bookmarks',
    createNoteTitle: 'Create Note',
    notesTitle: 'My Notes',
    reloadFeed: 'Reload Feed',
    reload: 'Reload',
    notePublic: 'public',
    createNote: 'Create Note',
    authLoginTab: 'Login',
    authRegisterTab: 'Register',
    loginTitle: 'Login',
    loginIdentifier: 'ID or Email',
    loginPassword: 'Password',
    loginBtn: 'Login',
    back: 'Back',
    forgotPassword: 'Forgot Password',
    registerTitle: 'Register',
    registerId: 'ID (required, unique)',
    registerEmail: 'Email (required)',
    registerNickname: 'Nickname (optional)',
    registerPassword: 'Password (min 8 chars)',
    registerBtn: 'Register',
    profileTitle: 'Profile',
    profileNickname: 'Nickname (optional)',
    profilePassword: 'New password (optional, min 8 chars)',
    saveProfile: 'Save Profile',
    logout: 'Logout',
    resetTitle: 'Reset Password',
    resetEmail: 'Email',
    sendReset: 'Send Reset Email',
    resetToken: 'Reset Token',
    resetNewPassword: 'New Password (min 8 chars)',
    confirmReset: 'Confirm Reset',
    notLoggedIn: 'Not logged in',
    noItems: 'No items',
    noBookmarks: 'No bookmarks',
    noNotes: 'No notes',
    source: 'source',
    useInNote: 'Use in Note',
    bookmark: 'Bookmark',
    openSource: 'open source',
    loginRequired: 'Login required',
    noteCreated: 'Note created',
    profileUpdated: 'Profile updated',
    resetSent: 'Reset email sent (if account exists)',
    resetDone: 'Password reset completed',
  },
  zh: {
    appTitle: 'AI Notebook MVP',
    appSubtitle: 'LLM 知识信息流、收藏和笔记。',
    uiLangLabel: '语言',
    loginRegister: '登录/注册',
    feedTitle: '信息流',
    bookmarksTitle: '我的收藏',
    createNoteTitle: '创建笔记',
    notesTitle: '我的笔记',
    reloadFeed: '刷新信息流',
    reload: '刷新',
    notePublic: '公开',
    createNote: '创建笔记',
    authLoginTab: '登录',
    authRegisterTab: '注册',
    loginTitle: '登录',
    loginIdentifier: 'ID 或邮箱',
    loginPassword: '密码',
    loginBtn: '登录',
    back: '返回',
    forgotPassword: '忘记密码',
    registerTitle: '注册',
    registerId: 'ID（必填，唯一）',
    registerEmail: '邮箱（必填）',
    registerNickname: '昵称（可选）',
    registerPassword: '密码（至少8位）',
    registerBtn: '注册',
    profileTitle: '个人资料',
    profileNickname: '昵称（可选）',
    profilePassword: '新密码（可选，至少8位）',
    saveProfile: '保存资料',
    logout: '退出登录',
    resetTitle: '重置密码',
    resetEmail: '邮箱',
    sendReset: '发送重置邮件',
    resetToken: '重置令牌',
    resetNewPassword: '新密码（至少8位）',
    confirmReset: '确认重置',
    notLoggedIn: '未登录',
    noItems: '暂无内容',
    noBookmarks: '暂无收藏',
    noNotes: '暂无笔记',
    source: '来源',
    useInNote: '用于笔记',
    bookmark: '收藏',
    openSource: '打开来源',
    loginRequired: '请先登录',
    noteCreated: '笔记已创建',
    profileUpdated: '资料已更新',
    resetSent: '如账号存在，重置邮件已发送',
    resetDone: '密码重置完成',
  },
};

const savedUiLang = localStorage.getItem(uiLangKey);
const browserUiLang = 'zh';

const state = {
  token: localStorage.getItem(tokenKey) || '',
  me: null,
  uiLang: savedUiLang === 'zh' || savedUiLang === 'en' ? savedUiLang : browserUiLang,
};

function t(key) {
  return i18n[state.uiLang]?.[key] || i18n.en[key] || key;
}

const el = {
  appTitle: document.getElementById('appTitle'),
  appSubtitle: document.getElementById('appSubtitle'),
  uiLangLabel: document.getElementById('uiLangLabel'),
  uiLang: document.getElementById('uiLang'),
  authEntryBtn: document.getElementById('authEntryBtn'),

  feedTitle: document.getElementById('feedTitle'),
  bookmarksTitle: document.getElementById('bookmarksTitle'),
  createNoteTitle: document.getElementById('createNoteTitle'),
  notesTitle: document.getElementById('notesTitle'),
  loadFeedBtn: document.getElementById('loadFeedBtn'),
  loadBookmarksBtn: document.getElementById('loadBookmarksBtn'),
  loadNotesBtn: document.getElementById('loadNotesBtn'),
  notePublicText: document.getElementById('notePublicText'),
  createNoteBtn: document.getElementById('createNoteBtn'),

  homeView: document.getElementById('homeView'),
  authView: document.getElementById('authView'),
  profileView: document.getElementById('profileView'),
  resetView: document.getElementById('resetView'),

  tabLogin: document.getElementById('tabLogin'),
  tabRegister: document.getElementById('tabRegister'),
  loginPane: document.getElementById('loginPane'),
  registerPane: document.getElementById('registerPane'),

  loginTitle: document.getElementById('loginTitle'),
  loginIdentifier: document.getElementById('loginIdentifier'),
  loginPassword: document.getElementById('loginPassword'),
  loginBtn: document.getElementById('loginBtn'),
  loginStatus: document.getElementById('loginStatus'),
  backFromAuthBtn: document.getElementById('backFromAuthBtn'),
  forgotPasswordBtn: document.getElementById('forgotPasswordBtn'),

  registerTitle: document.getElementById('registerTitle'),
  registerPublicId: document.getElementById('registerPublicId'),
  registerEmail: document.getElementById('registerEmail'),
  registerNickname: document.getElementById('registerNickname'),
  registerPassword: document.getElementById('registerPassword'),
  registerUiLang: document.getElementById('registerUiLang'),
  registerBtn: document.getElementById('registerBtn'),
  registerStatus: document.getElementById('registerStatus'),
  backFromRegisterBtn: document.getElementById('backFromRegisterBtn'),

  profileTitle: document.getElementById('profileTitle'),
  profilePublicId: document.getElementById('profilePublicId'),
  profileEmail: document.getElementById('profileEmail'),
  profileNickname: document.getElementById('profileNickname'),
  profilePassword: document.getElementById('profilePassword'),
  profileUiLang: document.getElementById('profileUiLang'),
  saveProfileBtn: document.getElementById('saveProfileBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  backFromProfileBtn: document.getElementById('backFromProfileBtn'),
  profileStatus: document.getElementById('profileStatus'),

  resetTitle: document.getElementById('resetTitle'),
  resetEmail: document.getElementById('resetEmail'),
  sendResetBtn: document.getElementById('sendResetBtn'),
  resetToken: document.getElementById('resetToken'),
  resetNewPassword: document.getElementById('resetNewPassword'),
  confirmResetBtn: document.getElementById('confirmResetBtn'),
  backFromResetBtn: document.getElementById('backFromResetBtn'),
  resetStatus: document.getElementById('resetStatus'),

  lang: document.getElementById('lang'),
  feed: document.getElementById('feed'),
  bookmarks: document.getElementById('bookmarks'),
  noteArticleId: document.getElementById('noteArticleId'),
  noteTitle: document.getElementById('noteTitle'),
  noteContent: document.getElementById('noteContent'),
  noteTags: document.getElementById('noteTags'),
  notePublic: document.getElementById('notePublic'),
  noteStatus: document.getElementById('noteStatus'),
  notes: document.getElementById('notes'),
};

function applyTranslations() {
  document.documentElement.lang = state.uiLang;
  el.uiLang.value = state.uiLang;
  el.appTitle.textContent = t('appTitle');
  el.appSubtitle.textContent = t('appSubtitle');
  el.uiLangLabel.textContent = t('uiLangLabel');
  el.feedTitle.textContent = t('feedTitle');
  el.bookmarksTitle.textContent = t('bookmarksTitle');
  el.createNoteTitle.textContent = t('createNoteTitle');
  el.notesTitle.textContent = t('notesTitle');
  el.loadFeedBtn.textContent = t('reloadFeed');
  el.loadBookmarksBtn.textContent = t('reload');
  el.loadNotesBtn.textContent = t('reload');
  el.notePublicText.textContent = t('notePublic');
  el.createNoteBtn.textContent = t('createNote');

  el.tabLogin.textContent = t('authLoginTab');
  el.tabRegister.textContent = t('authRegisterTab');
  el.loginTitle.textContent = t('loginTitle');
  el.loginIdentifier.placeholder = t('loginIdentifier');
  el.loginPassword.placeholder = t('loginPassword');
  el.loginBtn.textContent = t('loginBtn');
  el.backFromAuthBtn.textContent = t('back');
  el.forgotPasswordBtn.textContent = t('forgotPassword');

  el.registerTitle.textContent = t('registerTitle');
  el.registerPublicId.placeholder = t('registerId');
  el.registerEmail.placeholder = t('registerEmail');
  el.registerNickname.placeholder = t('registerNickname');
  el.registerPassword.placeholder = t('registerPassword');
  el.registerBtn.textContent = t('registerBtn');
  el.backFromRegisterBtn.textContent = t('back');

  el.profileTitle.textContent = t('profileTitle');
  el.profileNickname.placeholder = t('profileNickname');
  el.profilePassword.placeholder = t('profilePassword');
  el.saveProfileBtn.textContent = t('saveProfile');
  el.logoutBtn.textContent = t('logout');
  el.backFromProfileBtn.textContent = t('back');

  el.resetTitle.textContent = t('resetTitle');
  el.resetEmail.placeholder = t('resetEmail');
  el.sendResetBtn.textContent = t('sendReset');
  el.resetToken.placeholder = t('resetToken');
  el.resetNewPassword.placeholder = t('resetNewPassword');
  el.confirmResetBtn.textContent = t('confirmReset');
  el.backFromResetBtn.textContent = t('back');

  applyHeaderAuthLabel();
}

async function api(path, options = {}, withAuth = false) {
  const headers = options.headers ? { ...options.headers } : {};
  if (withAuth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

function setStatus(node, text, ok = true) {
  node.textContent = text;
  node.className = `status ${ok ? 'ok' : 'err'}`;
}

function setMuted(node, text) {
  node.textContent = text;
  node.className = 'status muted';
}

function showView(name) {
  el.homeView.classList.toggle('hidden', name !== 'home');
  el.authView.classList.toggle('hidden', name !== 'auth');
  el.profileView.classList.toggle('hidden', name !== 'profile');
  el.resetView.classList.toggle('hidden', name !== 'reset');
}

function showAuthTab(tab) {
  const isLogin = tab === 'login';
  el.loginPane.classList.toggle('hidden', !isLogin);
  el.registerPane.classList.toggle('hidden', isLogin);
  el.tabLogin.classList.toggle('active', isLogin);
  el.tabLogin.classList.toggle('secondary', !isLogin);
  el.tabRegister.classList.toggle('active', !isLogin);
  el.tabRegister.classList.toggle('secondary', isLogin);
}

function authLabelFromMe(me) {
  const nickname = (me.display_name || '').trim();
  if (nickname && nickname !== me.public_id) return nickname;
  return me.public_id;
}

function applyHeaderAuthLabel() {
  if (!state.me) {
    el.authEntryBtn.textContent = t('loginRegister');
    return;
  }
  el.authEntryBtn.textContent = authLabelFromMe(state.me);
}

function saveToken(token) {
  state.token = token;
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  state.token = '';
  state.me = null;
  localStorage.removeItem(tokenKey);
  applyHeaderAuthLabel();
}

async function refreshMe() {
  if (!state.token) {
    state.me = null;
    applyHeaderAuthLabel();
    return null;
  }
  try {
    state.me = await api('/auth/me', {}, true);
    if (state.me.ui_language === 'en' || state.me.ui_language === 'zh') {
      state.uiLang = state.me.ui_language;
      localStorage.setItem(uiLangKey, state.uiLang);
    }
    applyTranslations();
    return state.me;
  } catch (_err) {
    clearToken();
    return null;
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
        <span class="muted">${a.language}</span>
        <span class="spacer"></span>
        <button class="secondary">${t('useInNote')}</button>
        <button>${t('bookmark')}</button>
      </div>
    `;

    const useBtn = item.querySelectorAll('button')[0];
    const bookmarkBtn = item.querySelectorAll('button')[1];

    useBtn.onclick = () => {
      el.noteArticleId.value = a.id;
      if (!el.noteTitle.value) el.noteTitle.value = a.title;
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
        alert(`Bookmark failed: ${err.message}`);
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
      <p class="muted">${n.is_public ? 'public' : 'private'}</p>
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

async function createNote() {
  if (!state.token) {
    setStatus(el.noteStatus, t('loginRequired'), false);
    return;
  }

  const title = el.noteTitle.value.trim();
  const content = el.noteContent.value.trim();
  if (!title || !content) {
    setStatus(el.noteStatus, 'Title and content are required', false);
    return;
  }

  const payload = {
    article_id: el.noteArticleId.value.trim() || null,
    title,
    content,
    is_public: el.notePublic.checked,
    tags: el.noteTags.value.split(',').map((s) => s.trim()).filter(Boolean),
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
    setStatus(el.noteStatus, `Create failed: ${err.message}`, false);
  }
}

async function doLogin() {
  const identifier = el.loginIdentifier.value.trim();
  const password = el.loginPassword.value;
  if (!identifier || !password) {
    setStatus(el.loginStatus, 'ID/Email and password are required', false);
    return;
  }

  try {
    const out = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    saveToken(out.access_token);
    await refreshMe();
    setStatus(el.loginStatus, 'OK', true);
    showView('home');
    await Promise.all([loadBookmarks(), loadNotes()]);
  } catch (err) {
    setStatus(el.loginStatus, `Login failed: ${err.message}`, false);
  }
}

async function doRegister() {
  const public_id = el.registerPublicId.value.trim();
  const email = el.registerEmail.value.trim();
  const display_name = el.registerNickname.value.trim();
  const password = el.registerPassword.value;
  const ui_language = el.registerUiLang.value;

  if (!public_id || !email || !password) {
    setStatus(el.registerStatus, 'ID, email and password are required', false);
    return;
  }
  if (password.length < 8) {
    setStatus(el.registerStatus, 'Password must be at least 8 chars', false);
    return;
  }

  try {
    const out = await api('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id, email, display_name, password, ui_language }),
    });
    saveToken(out.access_token);
    await refreshMe();
    setStatus(el.registerStatus, 'OK', true);
    showView('home');
    await Promise.all([loadBookmarks(), loadNotes()]);
  } catch (err) {
    setStatus(el.registerStatus, `Register failed: ${err.message}`, false);
  }
}

function fillProfileForm() {
  if (!state.me) return;
  el.profilePublicId.value = state.me.public_id || '';
  el.profileEmail.value = state.me.email || '';
  el.profileNickname.value = state.me.display_name && state.me.display_name !== state.me.public_id ? state.me.display_name : '';
  el.profilePassword.value = '';
  el.profileUiLang.value = state.me.ui_language || 'zh';
}

async function saveProfile() {
  if (!state.token) {
    setStatus(el.profileStatus, t('loginRequired'), false);
    return;
  }

  const payload = {
    display_name: el.profileNickname.value,
    password: el.profilePassword.value || null,
    ui_language: el.profileUiLang.value,
  };

  try {
    const me = await api('/auth/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, true);
    state.me = me;
    state.uiLang = me.ui_language || state.uiLang;
    localStorage.setItem(uiLangKey, state.uiLang);
    applyTranslations();
    setStatus(el.profileStatus, t('profileUpdated'), true);
    fillProfileForm();
  } catch (err) {
    setStatus(el.profileStatus, `Update failed: ${err.message}`, false);
  }
}

async function sendResetEmail() {
  const email = el.resetEmail.value.trim();
  if (!email) {
    setStatus(el.resetStatus, 'Email is required', false);
    return;
  }
  try {
    await api('/auth/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setStatus(el.resetStatus, t('resetSent'), true);
  } catch (err) {
    setStatus(el.resetStatus, `Failed: ${err.message}`, false);
  }
}

async function confirmReset() {
  const token = el.resetToken.value.trim();
  const new_password = el.resetNewPassword.value;
  if (!token || !new_password) {
    setStatus(el.resetStatus, 'Token and password are required', false);
    return;
  }
  try {
    await api('/auth/password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password }),
    });
    setStatus(el.resetStatus, t('resetDone'), true);
  } catch (err) {
    setStatus(el.resetStatus, `Failed: ${err.message}`, false);
  }
}

function logout() {
  clearToken();
  showView('home');
  loadBookmarks();
  loadNotes();
}

function openAuth() {
  if (state.token) {
    fillProfileForm();
    setMuted(el.profileStatus, '');
    showView('profile');
    return;
  }
  showAuthTab('login');
  setMuted(el.loginStatus, t('notLoggedIn'));
  setMuted(el.registerStatus, '');
  showView('auth');
}

function openResetWithTokenIfAny() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const token = params.get('token');
  if (view === 'reset') {
    showView('reset');
    if (token) el.resetToken.value = token;
  }
}

async function boot() {
  el.uiLang.value = state.uiLang;
  applyTranslations();

  el.uiLang.onchange = async () => {
    state.uiLang = el.uiLang.value === 'zh' ? 'zh' : 'en';
    localStorage.setItem(uiLangKey, state.uiLang);
    applyTranslations();
    await Promise.all([loadFeed(), loadBookmarks(), loadNotes()]);
  };

  el.authEntryBtn.onclick = openAuth;
  el.tabLogin.onclick = () => showAuthTab('login');
  el.tabRegister.onclick = () => showAuthTab('register');
  el.backFromAuthBtn.onclick = () => showView('home');
  el.backFromRegisterBtn.onclick = () => showView('home');

  el.loginBtn.onclick = doLogin;
  el.registerBtn.onclick = doRegister;
  el.forgotPasswordBtn.onclick = () => {
    setMuted(el.resetStatus, '');
    showView('reset');
  };

  el.backFromProfileBtn.onclick = () => showView('home');
  el.saveProfileBtn.onclick = saveProfile;
  el.logoutBtn.onclick = logout;

  el.sendResetBtn.onclick = sendResetEmail;
  el.confirmResetBtn.onclick = confirmReset;
  el.backFromResetBtn.onclick = () => showView('home');

  el.loadFeedBtn.onclick = loadFeed;
  el.loadBookmarksBtn.onclick = loadBookmarks;
  el.loadNotesBtn.onclick = loadNotes;
  el.createNoteBtn.onclick = createNote;

  await refreshMe();
  showView('home');
  openResetWithTokenIfAny();
  await loadFeed();
  await loadBookmarks();
  await loadNotes();
}

boot();
