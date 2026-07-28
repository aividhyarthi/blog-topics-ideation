// Shared account widget for pages that don't have their own (index.astro,
// Site.astro-based marketing pages). Renders into any #cr-navauth element,
// injects its own sign-in/sign-up modal, and exposes window.CRAuth so a page's
// own script can gate an action behind login: CRAuth.requireAuth(fn).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const state = { accountsEnabled: false, user: null, ready: null };
  let pendingFn = null;

  function injectStyle() {
    if (document.getElementById('cra-style')) return;
    const s = document.createElement('style');
    s.id = 'cra-style';
    s.textContent = `
      .cra-widget { display: flex; align-items: center; gap: 12px; }
      .cra-email { font-size: 12.5px; color: var(--muted); font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cra-btn { font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; border-radius: 9px; padding: 8px 14px; border: 1px solid var(--line-2); background: #fff; color: var(--ink-2); text-decoration: none; display: inline-flex; align-items: center; }
      .cra-btn:hover { border-color: var(--accent); color: var(--accent); }
      .cra-btn.solid { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 700; }
      .cra-btn.solid:hover { background: var(--accent-dark); border-color: var(--accent-dark); color: #fff; }
      .cra-modal { position: fixed; inset: 0; z-index: 500; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: none; align-items: center; justify-content: center; padding: 20px; }
      .cra-modal.open { display: flex; }
      .cra-card { background: #fff; border-radius: 18px; width: 100%; max-width: 400px; padding: 26px; box-shadow: 0 24px 64px -24px rgba(15,23,42,.5); position: relative; }
      .cra-x { position: absolute; top: 12px; right: 14px; border: none; background: none; font-size: 22px; line-height: 1; color: var(--faint); cursor: pointer; }
      .cra-card h3 { margin: 0 0 4px; font-size: 19px; font-weight: 800; letter-spacing: -.02em; color: var(--ink); }
      .cra-sub { margin: 0 0 16px; font-size: 13px; color: var(--muted); }
      .cra-fld { display: block; font-size: 12.5px; color: var(--ink-2); font-weight: 600; margin: 12px 0 5px; }
      .cra-card input { width: 100%; border: 1px solid var(--line-2); border-radius: 10px; padding: 11px 13px; font-size: 14px; font-family: inherit; box-sizing: border-box; }
      .cra-card input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,70,229,.14); }
      .cra-go { width: 100%; justify-content: center; margin-top: 16px; padding: 11px; font-size: 14.5px; }
      .cra-switch { margin-top: 14px; font-size: 12.5px; color: var(--muted); text-align: center; }
      .cra-switch a { color: var(--accent-dark); font-weight: 700; cursor: pointer; }
      .cra-err { margin-top: 12px; padding: 9px 11px; border-radius: 9px; font-size: 12.5px; background: var(--bad-bg); color: #b3261e; border: 1px solid #f6c9c6; display: none; }
      .cra-mandate { margin-top: 14px; font-size: 12px; color: var(--accent-dark); background: var(--accent-soft); border: 1px solid var(--accent-line); border-radius: 9px; padding: 9px 11px; }
    `;
    document.head.appendChild(s);
  }

  function injectModal() {
    if (document.getElementById('cra-modal')) return;
    const d = document.createElement('div');
    d.id = 'cra-modal';
    d.className = 'cra-modal';
    d.innerHTML = '<div class="cra-card"><button class="cra-x" id="cra-close" aria-label="Close">&times;</button><div id="cra-body"></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', (e) => { if (e.target === d) closeModal(); });
    document.getElementById('cra-close').addEventListener('click', closeModal);
  }
  function openModal(html) { document.getElementById('cra-body').innerHTML = html; document.getElementById('cra-modal').classList.add('open'); }
  function closeModal() { document.getElementById('cra-modal').classList.remove('open'); pendingFn = null; }

  function openAuth(mode) {
    const isLogin = mode === 'login';
    openModal(`
      <h3>${isLogin ? 'Welcome back' : 'Create your free account'}</h3>
      <p class="cra-sub">${isLogin ? 'Sign in to continue.' : 'Free to start — no card required.'}</p>
      ${pendingFn ? '<div class="cra-mandate">An account is required to run a check — it takes 10 seconds.</div>' : ''}
      <label class="cra-fld" for="cra-email">Email</label>
      <input id="cra-email" type="email" placeholder="you@company.com" autocomplete="email" />
      <label class="cra-fld" for="cra-pw">Password</label>
      <input id="cra-pw" type="password" placeholder="${isLogin ? 'Your password' : 'At least 8 characters'}" autocomplete="${isLogin ? 'current-password' : 'new-password'}" />
      <div class="cra-err" id="cra-err"></div>
      <button class="cra-btn solid cra-go" id="cra-go">${isLogin ? 'Sign in' : 'Create account'}</button>
      ${isLogin ? '<div class="cra-switch"><a id="cra-forgot">Forgot your password?</a></div>' : ''}
      <div class="cra-switch">${isLogin ? 'New here? <a id="cra-switch">Create an account</a>' : 'Have an account? <a id="cra-switch">Sign in</a>'}</div>
    `);
    document.getElementById('cra-go').addEventListener('click', () => submit(mode));
    document.getElementById('cra-switch').addEventListener('click', () => openAuth(isLogin ? 'signup' : 'login'));
    document.getElementById('cra-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(mode); });
    const forgot = document.getElementById('cra-forgot');
    if (forgot) forgot.addEventListener('click', openForgot);
    document.getElementById('cra-email').focus();
  }

  function openForgot() {
    openModal(`
      <h3>Reset your password</h3>
      <p class="cra-sub">We'll email you a link to choose a new one. It expires in an hour.</p>
      <label class="cra-fld" for="cra-email">Email</label>
      <input id="cra-email" type="email" placeholder="you@company.com" autocomplete="email" />
      <div class="cra-err" id="cra-err"></div>
      <button class="cra-btn solid cra-go" id="cra-go">Send reset link</button>
      <div class="cra-switch">Remembered it? <a id="cra-switch">Sign in</a></div>
    `);
    const send = async () => {
      const email = document.getElementById('cra-email').value.trim();
      const err = document.getElementById('cra-err');
      const btn = document.getElementById('cra-go');
      if (!email) { err.textContent = 'Enter your email address.'; err.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/auth/forgot', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const d = await res.json();
        if (!res.ok) {
          err.textContent = d.error || 'Could not send the reset link.';
          err.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Send reset link';
          return;
        }
        openModal(`
          <h3>Check your inbox</h3>
          <p class="cra-sub">If an account exists for that address, a reset link is on its way. It expires in an hour.</p>
          <button class="cra-btn solid cra-go" id="cra-done">Done</button>
        `);
        document.getElementById('cra-done').addEventListener('click', closeModal);
      } catch {
        err.textContent = 'Network error. Try again.';
        err.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Send reset link';
      }
    };
    document.getElementById('cra-go').addEventListener('click', send);
    document.getElementById('cra-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    document.getElementById('cra-switch').addEventListener('click', () => openAuth('login'));
    document.getElementById('cra-email').focus();
  }

  async function submit(mode) {
    const email = document.getElementById('cra-email').value.trim();
    const pw = document.getElementById('cra-pw').value;
    const err = document.getElementById('cra-err');
    err.style.display = 'none';
    const btn = document.getElementById('cra-go');
    btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      const res = await fetch('/api/auth/' + (mode === 'login' ? 'login' : 'signup'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
      const d = await res.json();
      if (!res.ok) { err.textContent = d.error || 'Something went wrong.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = mode === 'login' ? 'Sign in' : 'Create account'; return; }
      // Reload so any server-rendered login-gated content (the tool form, the
      // dashboard) reveals itself — simpler and more robust than trying to keep
      // client state in sync with what the server decided to render.
      btn.textContent = 'Success — loading…';
      location.reload();
    } catch { err.textContent = 'Network error. Try again.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = mode === 'login' ? 'Sign in' : 'Create account'; }
  }

  async function signOut() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    state.user = null;
    render();
  }

  function render() {
    document.querySelectorAll('#cr-navauth').forEach((el) => {
      if (!state.accountsEnabled) { el.innerHTML = ''; return; }
      if (state.user) {
        // Inside the app shell the tab bar already links to Reports (/dashboard),
        // so showing a Dashboard button here would be a duplicate control.
        const inApp = document.body.classList.contains('appbody');
        const dash = inApp ? '' : '<a href="/dashboard" class="cra-btn">Dashboard</a>';
        el.innerHTML = `<span class="cra-email">${esc(state.user.email)}</span>${dash}<button class="cra-btn" id="cra-signout">Sign out</button>`;
        el.querySelector('#cra-signout').addEventListener('click', signOut);
      } else {
        el.innerHTML = `<button class="cra-btn" id="cra-signin">Log in</button><button class="cra-btn solid" id="cra-signup">Get started</button>`;
        el.querySelector('#cra-signin').addEventListener('click', () => { pendingFn = null; openAuth('login'); });
        el.querySelector('#cra-signup').addEventListener('click', () => { pendingFn = null; openAuth('signup'); });
      }
    });
  }

  async function refresh() {
    try {
      const d = await (await fetch('/api/auth/me')).json();
      state.accountsEnabled = Boolean(d.accountsEnabled);
      state.user = d.user;
    } catch { state.accountsEnabled = false; state.user = null; }
    render();
  }

  function init() {
    injectStyle();
    injectModal();
    state.ready = refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.CRAuth = {
    requireAuth(fn) {
      if (state.user) { fn(); return; }
      pendingFn = fn;
      openAuth('signup');
    },
    isSignedIn: () => Boolean(state.user),
    accountsEnabled: () => state.accountsEnabled,
    openAuth,
  };
})();
