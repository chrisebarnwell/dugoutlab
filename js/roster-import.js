/* DugoutLab roster import.
   Drop a CSV, TSV, or Excel file (GameChanger, TeamSnap, a Google Sheet export), or paste a column of names.
   Everything is parsed in the browser. Nothing is uploaded anywhere.
   Usage:  RosterImport.mount(el, function (names, records) { ... }, { template: { file, cols, rows, note }, noTeam });
   records carry the template's extra columns when present: tier (1-3), jersey, pod (right/left), parent_name, parent_email.
   Excel files load the SheetJS reader (js/vendor/xlsx.full.min.js, Apache-2.0) the first time one is chosen. */
(function () {
  var XLSX_URL = 'js/vendor/xlsx.full.min.js';

  function parseDelimited(text) {
    text = String(text || '').replace(/^\ufeff/, '');
    /* A typed list like "Smith, John" (comma then a space, two parts per line) is one name per line, not two columns. */
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var lf = function (l) { return /^[^,\t;"]+,\s+[^,\t;"]+$/.test(l.trim()); };
    if (lines.length && lines.some(lf) && lines.filter(lf).length * 2 > lines.length && !/name|player|first|last|roster/i.test(lines[0])) {
      return lines.map(function (l) { return lf(l) ? [l.trim()] : l.split(/[,\t;]/).map(function (x) { return x.trim(); }); });
    }
    var head = text.split(/\r?\n/).slice(0, 5).join('\n');
    var delim = ',';
    var counts = { ',': (head.match(/,/g) || []).length, '\t': (head.match(/\t/g) || []).length, ';': (head.match(/;/g) || []).length };
    if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) delim = '\t';
    else if (counts[';'] > counts[',']) delim = ';';
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (x) { return String(x).trim(); }); })
               .filter(function (r) { return r.some(Boolean); });
  }

  function looksLikeName(s) { return /[A-Za-z]/.test(s) && !/^\s*#?\d+\s*$/.test(s) && s.length <= 40 && !/@/.test(s); }
  function clean(s) {
    s = String(s || '').trim().replace(/^#?\d{1,3}\s+/, '').replace(/\s+#?\d{1,3}$/, '').replace(/\s+/g, ' ');
    var m = s.match(/^([^,]+),\s*(.+)$/); if (m) s = m[2] + ' ' + m[1]; /* "Last, First" to "First Last" */
    return s.trim();
  }

  /* Extra columns a DugoutLab template carries. Each tool keeps only the ones it saves. */
  function extras(hdr) {
    var x = { tier: -1, jersey: -1, pod: -1, pname: -1, pemail: -1 };
    hdr.forEach(function (h, i) {
      if (x.pemail < 0 && /e-?mail/.test(h)) x.pemail = i;
      else if (x.pname < 0 && /(parent|guardian|^mom|^dad|contact)/.test(h)) x.pname = i;
      else if (x.tier < 0 && /^(tier|level|group)/.test(h)) x.tier = i;
      else if (x.jersey < 0 && /^(#|jersey|uniform|number|num\b|no\.?$)/.test(h)) x.jersey = i;
      else if (x.pod < 0 && /^(pod|side)/.test(h)) x.pod = i;
    });
    return x;
  }
  function rec(name, r, x) {
    var o = { name: clean(name) };
    if (x && r) {
      var t = String(r[x.tier] || '').replace(/[^1-3]/g, '').charAt(0); if (x.tier >= 0 && t) o.tier = t;
      var j = String(r[x.jersey] || '').replace(/[^0-9]/g, '').slice(0, 3); if (x.jersey >= 0 && j) o.jersey = j;
      var pn = String(r[x.pname] || '').trim().slice(0, 60); if (x.pname >= 0 && pn) o.parent_name = pn;
      var pe = String(r[x.pemail] || '').trim().toLowerCase(); if (x.pemail >= 0 && /@/.test(pe)) o.parent_email = pe.slice(0, 120);
      var p = String(r[x.pod] || '').trim().toLowerCase(); if (x.pod >= 0 && p) o.pod = p.charAt(0) === 'l' ? 'left' : p.charAt(0) === 'r' ? 'right' : '';
    }
    return o;
  }

  function recordsFromRows(rows) {
    if (!rows.length) return [];
    var hdr = rows[0].map(function (h) { return h.toLowerCase(); });
    var first = -1, last = -1, name = -1;
    hdr.forEach(function (h, i) {
      if (first < 0 && /^(first|first ?name|player first|given)/.test(h)) first = i;
      else if (last < 0 && /^(last|last ?name|player last|surname|family)/.test(h)) last = i;
      else if (name < 0 && /(full ?name|player ?name|athlete|^name$|^player$|^kid$|^child)/.test(h)) name = i;
    });
    var x = extras(hdr), out = [];
    if (first >= 0) {
      rows.slice(1).forEach(function (r) { var n = ((r[first] || '') + ' ' + (last >= 0 ? (r[last] || '') : '')).trim(); if (looksLikeName(n)) out.push(rec(n, r, x)); });
    } else if (name >= 0) {
      rows.slice(1).forEach(function (r) { var n = r[name] || ''; if (looksLikeName(n)) out.push(rec(n, r, x)); });
    } else {
      /* No header we recognize: take the column with the most name-looking cells. */
      var cols = Math.max.apply(null, rows.map(function (r) { return r.length; })), best = 0, bestN = -1;
      for (var c = 0; c < cols; c++) { var n = rows.filter(function (r) { return looksLikeName(r[c] || ''); }).length; if (n > bestN) { bestN = n; best = c; } }
      var start = looksLikeName(rows[0][best] || '') && !/name|player|first|last|roster/i.test(rows[0][best] || '') ? 0 : 1;
      rows.slice(start).forEach(function (r) { var v = r[best] || ''; if (looksLikeName(v)) out.push(rec(v)); });
    }
    var seen = {}, ex = 0;
    var res = out.filter(function (o) {
      var k = o.name.toLowerCase();
      if (/^example\b/.test(k)) { ex++; return false; } /* template sample rows */
      if (!o.name || seen[k]) return false;
      seen[k] = 1; return true;
    }).slice(0, 40);
    if (!res.length && ex) res.examplesOnly = true;
    return res;
  }
  function namesFromRows(rows) { return recordsFromRows(rows).map(function (o) { return o.name; }); }

  /* Blank template in the exact columns this tool saves. CSV opens in Excel, Google Sheets, and Numbers. */
  function downloadTemplate(t) {
    var q = function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = '\ufeff' + [t.cols].concat(t.rows || []).map(function (r) { return r.map(q).join(','); }).join('\r\n') + '\r\n';
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = t.file; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function loadScript(src) {
    return new Promise(function (res, rej) { if (window.XLSX) return res(); var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }

  function readFile(file) {
    var isX = /\.xlsx?$/i.test(file.name);
    if (!isX) return file.text().then(parseDelimited);
    return loadScript(XLSX_URL).then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = window.XLSX.read(buf, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      return parseDelimited(window.XLSX.utils.sheet_to_csv(ws));
    });
  }

  var css = '.ri{border:1px dashed rgba(200,134,46,0.5);border-radius:10px;padding:0.8rem 0.9rem;margin:0.4rem 0 0.9rem;background:rgba(200,134,46,0.05)}' +
    '.ri-h{font-size:0.9rem;font-weight:600;color:var(--ink,#f4efe6);margin-bottom:0.45rem}' +
    '.ri-row{display:flex;flex-wrap:wrap;gap:0.45rem;align-items:center}' +
    '.ri-btn{display:inline-flex;align-items:center;min-height:38px;padding:0.4rem 0.9rem;border:1px solid rgba(200,134,46,0.6);border-radius:999px;background:transparent;color:var(--ink,#f4efe6);font:inherit;font-size:0.85rem;font-weight:600;cursor:pointer}' +
    '.ri-btn:hover{border-color:#C8862E;color:var(--gold-light,#e2a85a)}' +
    '.ri-paste{display:none;width:100%;min-height:96px;margin-top:0.5rem;background:var(--forest-deep,#0a1610);border:1px solid var(--rule,rgba(244,239,230,0.16));border-radius:8px;color:var(--ink,#f4efe6);padding:0.6rem 0.75rem;font:inherit;font-size:0.9rem}' +
    '.ri-paste.on{display:block}' +
    '.ri-msg{font-size:0.82rem;color:var(--ink-soft,rgba(244,239,230,0.75));margin-top:0.5rem;min-height:1.2em}' +
    '.ri-msg.ok{color:var(--ok,#7ad6a8);font-weight:600}.ri-msg.err{color:var(--gold-light,#e2a85a);font-weight:600}' +
    '.ri-fine{font-size:0.78rem;color:var(--ink-faint,rgba(244,239,230,0.6));margin-top:0.35rem}';

  /* My Team (team.html) from this phone's cache: { name, players: [first names] } or null */
  function myTeamFull() {
    try {
      var c = JSON.parse(localStorage.getItem('dl_team_v1') || 'null'); if (!c || !c.teams || !c.teams.length) return null;
      var cur = JSON.parse(localStorage.getItem('dl_team_cur') || 'null'), t = c.teams[0];
      c.teams.forEach(function (x) { if (x.id === cur) t = x; });
      var names = (c.players || []).filter(function (p) { return p.kind === 'player' && p.team_id === t.id; }).map(function (p) { return p.name; });
      return { name: t.name || '', players: names };
    } catch (e) { return null; }
  }
  function myTeam() { var t = myTeamFull(); return t ? t.players : []; }
  function getJ(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function putJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  window.RosterImport = {
    parse: function (text) { return namesFromRows(parseDelimited(text)); },
    records: function (text) { return recordsFromRows(parseDelimited(text)); },
    template: downloadTemplate,
    /* opts.template = { file, cols, rows, note }: adds "Download template". opts.noTeam hides "Use My Team". opts.noPaste hides the paste box (page has its own).
       opts.auto = { key, isEmpty(), onTeamName(name) }: a signed-in coach's My Team fills the tool on its own when the roster is empty,
       and stays in sync while the roster came from My Team. A file or paste the coach loads is never overwritten. */
    mount: function (el, onNames, opts) {
      opts = opts || {};
      if (!el || el.__ri) return;
      el.__ri = true;
      if (!document.getElementById('ri-css')) { var st = document.createElement('style'); st.id = 'ri-css'; st.textContent = css; document.head.appendChild(st); }
      el.innerHTML =
        '<div class="ri"><div class="ri-h">Already have a roster?</div>' +
        '<div class="ri-row">' +
          '<button type="button" class="ri-btn" data-ri="file">Upload CSV or Excel</button>' +
          (opts.noPaste ? '' : '<button type="button" class="ri-btn" data-ri="paste">Paste from a spreadsheet</button>') +
          (opts.template ? '<button type="button" class="ri-btn" data-ri="tpl">Download template</button>' : '') +
          '<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style="display:none">' +
        '</div>' +
        '<textarea class="ri-paste" placeholder="Paste a column of names here. One per line, or First and Last columns from GameChanger or TeamSnap."></textarea>' +
        '<div class="ri-row" style="margin-top:0.5rem;display:none" data-ri="paste-row"><button type="button" class="ri-btn" data-ri="use">Use these names</button></div>' +
        '<div class="ri-msg"></div>' +
        (opts.template ? '<div class="ri-fine">Fastest: fill in our template (' + opts.template.cols.join(', ') + ') and upload it. ' + (opts.template.note ? opts.template.note + ' ' : '') + 'Example rows are skipped.</div>' : '') +
        '<div class="ri-fine">Also works with GameChanger and TeamSnap exports, or any sheet with a name column. Parsed on your device. Nothing is uploaded.</div></div>';
      var input = el.querySelector('input[type=file]'), ta = el.querySelector('.ri-paste'), msg = el.querySelector('.ri-msg'), prow = el.querySelector('[data-ri=paste-row]');
      /* My Team (team.html): the coach's saved roster, one tap. Read from this phone, so it works offline. */
      var mine = opts.noTeam ? [] : myTeam();
      if (mine.length) {
        var tb = document.createElement('button'); tb.type = 'button'; tb.className = 'ri-btn'; tb.setAttribute('data-ri', 'team');
        tb.textContent = 'Use My Team (' + mine.length + ')';
        el.querySelector('.ri-row').insertBefore(tb, el.querySelector('.ri-row').firstChild);
        tb.addEventListener('click', function () { done(myTeam().map(function (n) { return { name: n }; }), 'My Team'); });
      }
      var srcKey = opts.auto ? 'dl_ri_src_' + opts.auto.key : null;
      function done(recs, src) {
        var names = recs.map(function (o) { return o.name; });
        if (srcKey && names.length) putJ(srcKey, src === 'My Team' ? { from: 'team', sig: names.join('|') } : { from: 'other' });
        if (!names.length && recs.examplesOnly) { msg.className = 'ri-msg err'; msg.textContent = 'Only the example rows are in there. Add your players under them and upload again.'; return; }
        if (!names.length) { msg.className = 'ri-msg err'; msg.textContent = 'No names found. Try a file with a Name column, or paste the names one per line.'; return; }
        msg.className = 'ri-msg ok'; msg.textContent = 'Loaded ' + names.length + ' names' + (src ? ' from ' + src : '') + '.';
        onNames(names, recs);
      }
      el.querySelector('[data-ri=file]').addEventListener('click', function () { input.click(); });
      if (!opts.noPaste) el.querySelector('[data-ri=paste]').addEventListener('click', function () { ta.classList.toggle('on'); prow.style.display = ta.classList.contains('on') ? 'flex' : 'none'; if (ta.classList.contains('on')) ta.focus(); });
      el.querySelector('[data-ri=use]').addEventListener('click', function () { done(recordsFromRows(parseDelimited(ta.value)), ''); });
      if (opts.template) el.querySelector('[data-ri=tpl]').addEventListener('click', function () { downloadTemplate(opts.template); });
      input.addEventListener('change', function () {
        var f = input.files && input.files[0]; if (!f) return;
        msg.className = 'ri-msg'; msg.textContent = 'Reading ' + f.name + '...';
        readFile(f).then(function (rows) { done(recordsFromRows(rows), f.name); })
          .catch(function () { msg.className = 'ri-msg err'; msg.textContent = 'Could not read that file. Export it as CSV and try again.'; });
        input.value = '';
      });
      if (opts.auto && !opts.noTeam) {
        var tryAuto = function () {
          var t = myTeamFull(); if (!t || !t.players.length) return;
          var was = getJ(srcKey), sig = t.players.join('|'), empty = false;
          try { empty = opts.auto.isEmpty(); } catch (e) {}
          if (!empty && !(was && was.from === 'team' && was.sig !== sig)) return;
          done(t.players.map(function (n) { return { name: n }; }), 'My Team');
          if (t.name && opts.auto.onTeamName) { try { opts.auto.onTeamName(t.name); } catch (e) {} }
        };
        var run = function () {
          tryAuto();
          var n = 0;
          (function wait() {
            if (window.DLTeam && DLTeam.refresh) DLTeam.refresh().then(tryAuto).catch(function () {});
            else if (n++ < 20) setTimeout(wait, 250);
          })();
        };
        if (document.readyState === 'complete') setTimeout(run, 0);
        else window.addEventListener('load', function () { setTimeout(run, 0); });
      }
    }
  };
})();
