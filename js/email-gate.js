/* DugoutLab email gate.
   Rule (2026-10-31): never on page load. The tool is always usable first.
   The gate asks only when someone keeps something: print, a download link, or anything marked data-gate.
   It can always be closed ("Not now"), and closing never blocks the action they asked for.
   <script src="js/email-gate.js" data-mode="actions"></script>
   Saved to D1 "subscribers" via /api/subscribe (source "gate-<page>").
   Anyone signed in to the Hit Window or Pitch Tracker is already in. */
(function () {
      var KEY = 'dl_email_ok';
  var skipped = false;

  function ok() {
    try {
      if (localStorage.getItem(KEY)) return true;
      var a = JSON.parse(localStorage.getItem('dl_pitch') || 'null') || JSON.parse(localStorage.getItem('dl_game2') || 'null');
      return !!(a && a.token);
    } catch (e) { return false; }
  }
  function mark(email) { try { localStorage.setItem(KEY, JSON.stringify({ email: email, at: Date.now() })); localStorage.setItem('dl_last_email', email); } catch (e) {} }
  function page() { return (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index'; }

  var css = '' +
    '.dl-gate{position:fixed;inset:0;z-index:2000;background:rgba(10,22,16,0.86);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem}' +
    '.dl-gate-box{background:#15291f;border:1px solid #C8862E;border-radius:16px;max-width:420px;width:100%;padding:1.6rem 1.3rem;color:#f4efe6;box-shadow:0 8px 32px rgba(0,0,0,0.4)}' +
    '.dl-gate-eb{font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:0.68rem;letter-spacing:0.18em;text-transform:uppercase;color:#C8862E;margin-bottom:0.5rem}' +
    '.dl-gate-h{font-family:\'Playfair Display\',Georgia,serif;font-size:1.5rem;font-weight:600;line-height:1.15;letter-spacing:-0.015em;margin-bottom:0.5rem}' +
    '.dl-gate-p{color:rgba(244,239,230,0.72);font-size:1rem;line-height:1.5;margin-bottom:1rem}' +
    '.dl-gate input[type=email]{width:100%;background:#0a1610;border:1px solid rgba(244,239,230,0.16);color:#f4efe6;border-radius:9px;padding:0.8rem 0.9rem;font-family:\'Inter\',system-ui,sans-serif;font-size:1rem;margin-bottom:0.7rem}' +
    '.dl-gate input[type=email]:focus{outline:2px solid #C8862E;outline-offset:-1px}' +
    '.dl-gate label{display:flex;gap:0.55rem;align-items:flex-start;font-size:0.92rem;color:rgba(244,239,230,0.72);line-height:1.4;margin-bottom:0.9rem;cursor:pointer}' +
    '.dl-gate label input{width:20px;height:20px;flex:0 0 20px;accent-color:#C8862E;margin-top:1px}' +
    '.dl-gate-err{color:#e2a85a;font-size:0.9rem;min-height:1.2em;margin:-0.3rem 0 0.5rem}' +
    '.dl-gate-note{color:rgba(244,239,230,0.5);font-size:0.8rem;line-height:1.45;margin-top:0.8rem}' +
    '.dl-gate-x{background:none;border:0;color:rgba(244,239,230,0.5);font-size:0.85rem;margin-top:0.6rem;padding:0;text-decoration:underline}' +
    '.dl-gate-btn{display:block;width:100%;background:#C8862E;color:#0a1610;border:0;border-radius:10px;padding:0.95rem 1rem;font-family:\'Inter\',system-ui,sans-serif;font-size:1rem;font-weight:600;cursor:pointer}' +
    '.dl-gate-btn:disabled{opacity:0.6}' +
    '.dl-gate a{color:#e2a85a}' +
    '.dl-gate .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
    'body.dl-gated{overflow:hidden}';

  function build(after, canClose) {
    if (!document.getElementById('dl-gate-css')) {
      var st = document.createElement('style'); st.id = 'dl-gate-css'; st.textContent = css; document.head.appendChild(st);
    }
    var wrap = document.createElement('div');
    wrap.className = 'dl-gate'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'dl-gate-h');
    wrap.innerHTML =
      '<div class="dl-gate-box">' +
        '<div class="dl-gate-eb">One quick thing</div>' +
        '<div class="dl-gate-h" id="dl-gate-h">Want the next tool when it is ready?</div>' +
        '<p class="dl-gate-p">Drop your email and we will send an occasional new tool or guide. No password, no card.</p>' +
        '<input type="email" id="dl-gate-email" placeholder="you@email.com" autocomplete="email" inputmode="email" maxlength="120">' +
        '<input type="text" class="hp" id="dl-gate-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<label id="dl-gate-adult-row"><input type="checkbox" id="dl-gate-adult"> <span>I\'m 18 or older (a coach or parent).</span></label>' +
        '<div class="dl-gate-err" id="dl-gate-err"></div>' +
        '<button type="button" class="dl-gate-btn" id="dl-gate-go">Continue</button>' +
        '<div class="dl-gate-note" style="font-size:0.95rem;color:rgba(244,239,230,0.72)"><span id="dl-gate-swap-t">Already signed up?</span> <button type="button" class="dl-gate-x" style="margin:0;color:#e2a85a;font-weight:600;font-size:0.95rem" id="dl-gate-swap">Sign in</button></div>' +
                (canClose ? '<button type="button" class="dl-gate-x" id="dl-gate-x">Not now, just continue</button>' : '') +
      '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('dl-gated');
    var input = document.getElementById('dl-gate-email');
    var signin = false;
    function setIn(v) {
      signin = v;
      document.getElementById('dl-gate-h').textContent = v ? 'Welcome back.' : 'Want the next tool when it is ready?';
      document.getElementById('dl-gate-adult-row').style.display = v ? 'none' : '';
      document.getElementById('dl-gate-go').textContent = v ? 'Sign in' : 'Continue';
      document.getElementById('dl-gate-swap-t').textContent = v ? 'New here?' : 'Already signed up?';
      document.getElementById('dl-gate-swap').textContent = v ? 'Sign up' : 'Sign in';
      document.getElementById('dl-gate-err').textContent = '';
    }
    document.getElementById('dl-gate-swap').addEventListener('click', function () { setIn(!signin); input.focus(); });
    try { var lastE = localStorage.getItem('dl_last_email'); if (lastE) { input.value = lastE; setIn(true); } } catch (e) {}
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);

    function close() { wrap.parentNode && wrap.parentNode.removeChild(wrap); document.body.classList.remove('dl-gated'); }
    /* "Not now" closes the gate and still does what they asked. Asked once per visit. */
    if (canClose) document.getElementById('dl-gate-x').addEventListener('click', function () { skipped = true; close(); if (after) after(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) { skipped = true; close(); if (after) after(); } });

    function go() {
      var err = document.getElementById('dl-gate-err'), b = document.getElementById('dl-gate-go');
      var email = String(input.value || '').trim().toLowerCase();
      err.textContent = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'That email does not look right.'; return; }
      if (signin) {
        b.disabled = true; b.textContent = 'Signing in...';
        return fetch('/api/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) { err.textContent = j.error || 'Could not sign in. Try again.'; b.disabled = false; b.textContent = 'Sign in'; if (r.status === 404) setIn(false), err.textContent = j.error; return; }
            mark(email); close(); if (after) after();
          }); })
          .catch(function () { mark(email); close(); if (after) after(); });
      }
      if (!document.getElementById('dl-gate-adult').checked) { err.textContent = 'Check the box to confirm you are 18 or older.'; return; }
      b.disabled = true; b.textContent = 'One sec...';
      fetch('/api/subscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'gate-' + page(), website: document.getElementById('dl-gate-hp').value })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 400) throw new Error(j.error || 'That email does not look right.');
          mark(email); close(); if (after) after();
        });
      }).catch(function (e) {
        /* A bad address stays on the gate. A network or server hiccup lets them in rather than punishing them. */
        if (/look right/i.test(e.message)) { err.textContent = e.message; b.disabled = false; b.textContent = 'Continue'; return; }
        mark(email); close(); if (after) after();
      });
    }
    document.getElementById('dl-gate-go').addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  function start() {
    function pass() { return ok() || skipped; }
    /* Print (any button that calls window.print) */
    var realPrint = window.print ? window.print.bind(window) : null;
    if (realPrint) window.print = function () { if (pass()) return realPrint(); build(realPrint, true); };
    /* Download links and anything marked data-gate */
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('a[download], a[data-gate], button[data-gate]');
      if (!el || pass()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      build(function () {
        if (el.tagName === 'A') { var t = document.createElement('a'); t.href = el.href; if (el.hasAttribute('download')) t.setAttribute('download', el.getAttribute('download') || ''); document.body.appendChild(t); t.click(); t.remove(); }
        else el.click();
      }, true);
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
