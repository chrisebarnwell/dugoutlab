/* "Email me my lineup" box, shared by pods.html (Mode A) and lineup.html (Mode B).
   LineupEmail.mount(el, getLineup): getLineup() returns the lineup exactly as shown
   { title, mode, details[], firstCol, columns[], rows[{name, cells[]} | {group}], legend }.
   Only names and positions are sent. Tiers and notes never leave the page. */
(function () {
  var statusP = null;
  function status() {
    if (!statusP) {
      statusP = fetch('/api/lineup-email', { headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : { enabled: false }; })
        .then(function (j) { return !!(j && j.enabled); })
        .catch(function () { return false; });
    }
    return statusP;
  }

  function mount(el, getLineup) {
    if (!el || el.getAttribute('data-le')) return;
    el.setAttribute('data-le', '1');
    el.innerHTML =
      '<div class="le-box no-print">' +
      '<div class="le-h">Keep a copy for game day.</div>' +
      '<p class="le-sub">Email this lineup to yourself.</p>' +
      '<form class="le-form" novalidate>' +
      '<input type="email" class="le-email" maxlength="120" autocomplete="email" inputmode="email" placeholder="you@email.com" aria-label="Your email">' +
      '<input type="text" class="le-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="submit" class="le-btn" disabled>Email me my lineup</button>' +
      '</form>' +
      '<label class="le-opt"><input type="checkbox" class="le-optin"> Also send me occasional DugoutLab coaching tools and updates.</label>' +
      '<div class="le-msg" role="status" aria-live="polite">Checking email delivery...</div>' +
      '<p class="le-fine">Your roster is saved in this browser. If you email a lineup, we send that lineup and your email address for delivery. Emailing does not create an account or save lineup history online.</p>' +
      '</div>';
    var form = el.querySelector('.le-form'), input = el.querySelector('.le-email'), btn = el.querySelector('.le-btn'),
      msg = el.querySelector('.le-msg'), opt = el.querySelector('.le-optin'), hp = el.querySelector('.le-hp');
    var on = false;
    function say(t, kind) { msg.textContent = t; msg.className = 'le-msg' + (kind ? ' le-' + kind : ''); }

    status().then(function (enabled) {
      on = enabled;
      if (on) { btn.disabled = false; say(''); }
      else { btn.disabled = true; input.disabled = true; opt.disabled = true; say('Email delivery is being set up and is not working yet. Print or download your lineup for now.', 'off'); }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!on) return;
      var email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('That email does not look right.', 'err'); input.focus(); return; }
      var lineup;
      try { lineup = getLineup(); } catch (err) { lineup = null; }
      if (!lineup || !lineup.rows || !lineup.rows.length) { say('Build a lineup first, then email it.', 'err'); return; }
      btn.disabled = true; btn.textContent = 'Sending...'; say('Sending your lineup...');
      fetch('/api/lineup-email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email, optin: opt.checked === true, lineup: lineup, website: hp.value })
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok || !x.j.ok) throw new Error((x.j && x.j.error) || 'Something went wrong. Try again.');
          say('Sent to ' + email + '. Check your inbox (and spam, the first time).', 'ok');
          btn.textContent = 'Send again';
        })
        .catch(function (err) {
          say((err && err.message && err.message !== 'Failed to fetch') ? err.message : 'Could not reach the email service. Check your connection and try again.', 'err');
          btn.textContent = 'Try again';
        })
        .then(function () { btn.disabled = false; });
    });
  }

  window.LineupEmail = { mount: mount };
})();
