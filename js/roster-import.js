/* DugoutLab roster import.
   Drop a CSV, TSV, or Excel file (GameChanger, TeamSnap, a Google Sheet export), or paste a column of names.
   Everything is parsed in the browser. Nothing is uploaded anywhere.
   Usage:  RosterImport.mount(document.getElementById('roster-import'), function (names) { ... });
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

  function namesFromRows(rows) {
    if (!rows.length) return [];
    var hdr = rows[0].map(function (h) { return h.toLowerCase(); });
    var first = -1, last = -1, name = -1;
    hdr.forEach(function (h, i) {
      if (first < 0 && /^(first|first ?name|player first|given)/.test(h)) first = i;
      else if (last < 0 && /^(last|last ?name|player last|surname|family)/.test(h)) last = i;
      else if (name < 0 && /(full ?name|player ?name|athlete|^name$|^player$|^kid$|^child)/.test(h)) name = i;
    });
    var out = [];
    if (first >= 0) {
      rows.slice(1).forEach(function (r) { var n = ((r[first] || '') + ' ' + (last >= 0 ? (r[last] || '') : '')).trim(); if (looksLikeName(n)) out.push(clean(n)); });
    } else if (name >= 0) {
      rows.slice(1).forEach(function (r) { var n = r[name] || ''; if (looksLikeName(n)) out.push(clean(n)); });
    } else {
      /* No header we recognize: take the column with the most name-looking cells. */
      var cols = Math.max.apply(null, rows.map(function (r) { return r.length; })), best = 0, bestN = -1;
      for (var c = 0; c < cols; c++) { var n = rows.filter(function (r) { return looksLikeName(r[c] || ''); }).length; if (n > bestN) { bestN = n; best = c; } }
      var start = looksLikeName(rows[0][best] || '') && !/name|player|first|last|roster/i.test(rows[0][best] || '') ? 0 : 1;
      rows.slice(start).forEach(function (r) { var v = r[best] || ''; if (looksLikeName(v)) out.push(clean(v)); });
    }
    var seen = {};
    return out.filter(function (n) { var k = n.toLowerCase(); if (!n || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 40);
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
    '.ri-btn:hover{border-color:#C8862E;color:#e2a85a}' +
    '.ri-paste{display:none;width:100%;min-height:96px;margin-top:0.5rem;background:#0a1610;border:1px solid rgba(244,239,230,0.16);border-radius:8px;color:#f4efe6;padding:0.6rem 0.75rem;font:inherit;font-size:0.9rem}' +
    '.ri-paste.on{display:block}' +
    '.ri-msg{font-size:0.82rem;color:rgba(244,239,230,0.6);margin-top:0.5rem;min-height:1.2em}' +
    '.ri-msg.ok{color:#7ad6a8;font-weight:600}.ri-msg.err{color:#e2a85a;font-weight:600}' +
    '.ri-fine{font-size:0.74rem;color:rgba(244,239,230,0.45);margin-top:0.35rem}';

  window.RosterImport = {
    parse: function (text) { return namesFromRows(parseDelimited(text)); },
    mount: function (el, onNames) {
      if (!el || el.__ri) return;
      el.__ri = true;
      if (!document.getElementById('ri-css')) { var st = document.createElement('style'); st.id = 'ri-css'; st.textContent = css; document.head.appendChild(st); }
      el.innerHTML =
        '<div class="ri"><div class="ri-h">Already have a roster?</div>' +
        '<div class="ri-row">' +
          '<button type="button" class="ri-btn" data-ri="file">Upload CSV or Excel</button>' +
          '<button type="button" class="ri-btn" data-ri="paste">Paste from a spreadsheet</button>' +
          '<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style="display:none">' +
        '</div>' +
        '<textarea class="ri-paste" placeholder="Paste a column of names here. One per line, or First and Last columns from GameChanger or TeamSnap."></textarea>' +
        '<div class="ri-row" style="margin-top:0.5rem;display:none" data-ri="paste-row"><button type="button" class="ri-btn" data-ri="use">Use these names</button></div>' +
        '<div class="ri-msg"></div>' +
        '<div class="ri-fine">Works with GameChanger and TeamSnap exports, or any sheet with a name column. Parsed on your device. Nothing is uploaded.</div></div>';
      var input = el.querySelector('input[type=file]'), ta = el.querySelector('.ri-paste'), msg = el.querySelector('.ri-msg'), prow = el.querySelector('[data-ri=paste-row]');
      function done(names, src) {
        if (!names.length) { msg.className = 'ri-msg err'; msg.textContent = 'No names found. Try a file with a Name column, or paste the names one per line.'; return; }
        msg.className = 'ri-msg ok'; msg.textContent = 'Loaded ' + names.length + ' names' + (src ? ' from ' + src : '') + '.';
        onNames(names);
      }
      el.querySelector('[data-ri=file]').addEventListener('click', function () { input.click(); });
      el.querySelector('[data-ri=paste]').addEventListener('click', function () { ta.classList.toggle('on'); prow.style.display = ta.classList.contains('on') ? 'flex' : 'none'; if (ta.classList.contains('on')) ta.focus(); });
      el.querySelector('[data-ri=use]').addEventListener('click', function () { done(namesFromRows(parseDelimited(ta.value)), ''); });
      input.addEventListener('change', function () {
        var f = input.files && input.files[0]; if (!f) return;
        msg.className = 'ri-msg'; msg.textContent = 'Reading ' + f.name + '...';
        readFile(f).then(function (rows) { done(namesFromRows(rows), f.name); })
          .catch(function () { msg.className = 'ri-msg err'; msg.textContent = 'Could not read that file. Export it as CSV and try again.'; });
        input.value = '';
      });
    }
  };
})();
