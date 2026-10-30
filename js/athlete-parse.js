/* DugoutLab Athlete Plan: text and dictation into a reviewable entry.
   Layer 3. Deterministic. A small vocabulary of baseball and softball words and quantities.
   It never invents a number. Anything it did not understand comes back in "unmatched",
   anything it guessed comes back marked "assumed", and a missing pitch count becomes a question.
   The page shows all of it, lets the person fix it, and saves only after they confirm.

   parse(text, { today: 'YYYY-MM-DD' }) ->
   { date, dateNote, fields: [{ key, label, value, kind, status, options? }], questions: [...], unmatched: [...] } */
window.DL_PARSE = (function () {
  'use strict';

  var NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3, several: 3 };
  var ASSUMED_NUM = { a: 1, an: 1, couple: 2, few: 3, several: 3 };
  var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var SPORTS = ['soccer', 'basketball', 'football', 'volleyball', 'lacrosse', 'hockey', 'swimming', 'swim', 'track', 'tennis', 'gymnastics', 'wrestling', 'dance', 'golf', 'cross country', 'flag football', 'cheer'];
  var AREA = [
    ['arm', /\b(arm|shoulder|elbow|forearm|wrist|bicep|tricep)s?\b/],
    ['knee', /\b(knee|heel|shin|kneecap|patella)s?\b/],
    ['back', /\b(back|spine|lower back)\b/],
    ['other', /\b(ankle|foot|feet|hip|groin|hamstring|quad|calf|calves|neck|hand|finger|thumb|side|oblique|rib)s?\b/]
  ];
  var SYMPTOM = /\b(tired|sore|soreness|hurt|hurts|hurting|pain|painful|ache|aches|achy|aching|tight|tightness|stiff|fatigue|fatigued|dead|tender|bugging|bothering)\b/;
  var NEG = /\b(no|not|isn't|isnt|doesn't|doesnt|didn't|didnt|never|without|zero)\b/;

  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function lastWeekday(today, idx) { var d = parseYmd(today), back = (d.getDay() - idx + 7) % 7; return addDays(today, -back); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function num(tok) { if (/^\d+$/.test(tok)) return +tok; return NUM[tok] != null ? NUM[tok] : null; }
  /* "three games", "3 games", "a game", "games (2)" */
  function countBefore(clause, nounRe) {
    var re = new RegExp('(\\b(\\d+|' + Object.keys(NUM).join('|') + ')\\b)\\s+(more\\s+|extra\\s+|of\\s+the\\s+|\\w+\\s+)?' + nounRe), m = clause.match(re);
    if (m) return { n: num(m[2]), assumed: ASSUMED_NUM[m[2]] != null };
    var re2 = new RegExp(nounRe + '\\s*\\(?\\s*(\\d+)\\)?'), m2 = clause.match(re2);
    if (m2) return { n: +m2[1], assumed: false };
    return null;
  }

  function parse(text, opts) {
    opts = opts || {};
    var today = opts.today || ymd(new Date());
    var raw = String(text || '').trim();
    var t = raw.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
    var fields = [], questions = [], unmatched = [], matched = [];
    var date = today, dateNote = 'No date given, so today.', dateStatus = 'assumed';
    function set(key, label, value, kind, status, options) {
      for (var i = 0; i < fields.length; i++) if (fields[i].key === key) { fields[i].value = value; fields[i].status = status; return; }
      fields.push({ key: key, label: label, value: value, kind: kind, status: status || 'recognized', options: options });
    }
    function hit(s) { matched.push(s); }

    /* ---------- date ---------- */
    if (/\byesterday\b|\blast night\b/.test(t)) { date = addDays(today, -1); dateNote = 'Yesterday.'; dateStatus = 'recognized'; hit('yesterday'); }
    else if (/\btoday\b|\bthis morning\b|\btonight\b|\bthis afternoon\b/.test(t)) { date = today; dateNote = 'Today.'; dateStatus = 'recognized'; hit('today'); }
    else if (/\bthis weekend\b|\bover the weekend\b|\bthe weekend\b|\bweekend\b/.test(t)) { date = lastWeekday(today, 0); if (date > today) date = today; dateNote = 'Weekend, so the most recent Sunday. Change it if it was Saturday.'; dateStatus = 'assumed'; hit('weekend'); }
    var dm = t.match(/\b(last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (dm && dateStatus !== 'recognized') { date = lastWeekday(today, DAYS.indexOf(dm[2])); dateNote = 'Most recent ' + cap(dm[2]) + '.'; dateStatus = 'recognized'; hit(dm[0]); }
    set('date', 'Date', date, 'date', dateStatus);

    /* ---------- clauses ---------- */
    var clauses = t.split(/[.;!?]|,\s*(?:and\s+|but\s+|then\s+)?|\band\b|\bbut\b|\bthen\b/).map(function (c) { return c.trim(); }).filter(Boolean);
    var games = null, gamesAssumed = false, practices = null, practicesAssumed = false;
    var pitched = false, pitches = null, pitchDay = null, caught = false, tournament = false;
    var discomfort = {}, noPain = false, growth = false, sessionDone = null, sessionTag = null, feel = null, other = [], tired = false, rest = false, skipped = false;

    clauses.forEach(function (c) {
      var used = false, neg = NEG.test(c);
      /* games */
      if (/\bdouble ?header\b/.test(c)) { games = (games || 0) + 2; used = true; }
      var cg = countBefore(c, 'games?\\b');
      if (cg && cg.n != null) { games = (games || 0) + cg.n; gamesAssumed = gamesAssumed || cg.assumed; used = true; }
      else if (/\bgames?\b/.test(c) && !/\bgame\s*day\b/.test(c)) { if (games == null && !neg) { games = 1; gamesAssumed = true; } used = true; }
      if (/\btournament\b|\btourney\b/.test(c)) { tournament = true; used = true; }
      /* practices */
      var cp = countBefore(c, 'practices?\\b');
      if (cp && cp.n != null) { practices = (practices || 0) + cp.n; practicesAssumed = practicesAssumed || cp.assumed; used = true; }
      else if (/\bpractices?\b/.test(c) && !/\bpitch(ing)? practice\b/.test(c)) { if (practices == null && !neg) { practices = 1; practicesAssumed = true; } used = true; }
      /* pitching */
      if (/\bpitched\b|\bpitching\b|\bon the mound\b|\bthrew (an|one|two|three|\d+) innings?\b|\bthrew\b.*\bpitches\b|\bpitch count\b/.test(c) && !/\bpitch(ing)? practice\b/.test(c)) {
        if (!neg) pitched = true; used = true;
        var pc = c.match(/\b(\d+)\s*(pitches|pitch count)\b/) || c.match(/\bpitch count\b[^\d]*(\d+)/);
        if (pc) pitches = +pc[1];
        var pd = c.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/); if (pd) pitchDay = cap(pd[1]);
      }
      if (/\bcaught\b|\bcatching\b|\bbehind the plate\b/.test(c) && !neg) { caught = true; used = true; }
      /* discomfort */
      AREA.forEach(function (a) {
        if (a[1].test(c) && SYMPTOM.test(c)) { if (!neg) discomfort[a[0]] = (c.match(SYMPTOM) || [''])[0]; used = true; }
      });
      if (neg && SYMPTOM.test(c)) { noPain = true; used = true; }
      if (/\b(feels|feeling|felt|is|was|are)\b.*\b(tired|wiped|exhausted|gassed|beat|dead)\b/.test(c) && !Object.keys(discomfort).length && !/\b(arm|shoulder|elbow|knee|heel|back)\b/.test(c)) { if (!neg) tired = true; used = true; }
      /* growth */
      if (/\bgrowth spurt\b|\bgrew\b|\bgrowing\b|\btaller\b|\bshoe size\b|\boutgrew\b|\bshot up\b|\bsprouted\b|\bnew (shoes|cleats)\b|\b(shoes|cleats) (don'?t|do not|won'?t) fit\b/.test(c)) { growth = true; used = true; }
      /* sessions */
      var st = c.match(/\b(session|workout|day)\s*([abc])\b/); if (st) sessionTag = st[2].toUpperCase();
      if (/\b(did|done|finished|completed|crushed|got (in|through)|knocked out|wrapped)\b.*\b(session|workout|training|plan|day [abc]|the move|strength day)\b|\bworked out\b|\btrained\b|\bdid (the|her|his|their|my) (plan|workout|session)\b/.test(c)) { if (!neg) sessionDone = true; used = true; }
      if (/\bskipped\b|\bmissed\b|\bdidn'?t (do|get to|train|work ?out)\b|\bno workout\b|\bno session\b|\btook (the day|today|yesterday) off\b/.test(c)) { skipped = true; used = true; }
      if (/\brest day\b|\bday off\b|\brested\b/.test(c)) { rest = true; used = true; }
      var fm = c.match(/\b(felt|was|seemed|went)\b\s+(really\s+|pretty\s+|super\s+|kind of\s+|kinda\s+)?(easy|light|simple|hard|tough|rough|brutal|fine|ok|okay|good|great|solid|just right|smooth)\b/);
      if (fm) { var w = fm[3]; feel = /easy|light|simple/.test(w) ? 'easy' : /hard|tough|rough|brutal/.test(w) ? 'hard' : 'ok'; used = true; }
      /* other sports */
      SPORTS.forEach(function (s) { if (new RegExp('\\b' + s + '\\b').test(c)) { if (other.indexOf(s) < 0) other.push(s); used = true; } });
      if (!used && c.length > 2) unmatched.push(c);
    });

    /* ---------- fields ---------- */
    if (games != null) set('games', 'Games played', games, 'num', gamesAssumed ? 'assumed' : 'recognized');
    if (tournament) { set('tournament', 'Tournament', true, 'bool'); if (games == null) questions.push({ key: 'games', prompt: 'How many games in the tournament?', kind: 'num' }); }
    if (practices != null) set('practices', 'Practices', practices, 'num', practicesAssumed ? 'assumed' : 'recognized');
    if (pitched) {
      set('pitched', 'Pitched' + (pitchDay ? ' (' + pitchDay + ')' : ''), true, 'bool');
      if (pitches != null) set('pitches', 'Pitch count', pitches, 'num');
      else { set('pitches', 'Pitch count', null, 'num', 'unknown'); questions.push({ key: 'pitches', prompt: 'Do you know the pitch count? Leave it blank if not. We never guess it.', kind: 'num' }); }
    }
    if (caught) set('caught', 'Caught', true, 'bool');
    Object.keys(discomfort).forEach(function (a) { set('discomfort', 'Reported discomfort', a, 'choice', 'recognized', ['none', 'knee', 'arm', 'back', 'other']); set('discomfortWord', 'Their word for it', discomfort[a], 'text'); });
    if (noPain && !Object.keys(discomfort).length) set('discomfort', 'Reported discomfort', 'none', 'choice', 'recognized', ['none', 'knee', 'arm', 'back', 'other']);
    if (tired) set('tired', 'Tired (general)', true, 'bool');
    if (growth) set('growth', 'Growth sign reported', true, 'bool');
    if (sessionDone) { set('sessionDone', 'Plan session done', true, 'bool'); if (sessionTag) set('sessionTag', 'Which session', sessionTag, 'choice', 'recognized', ['A', 'B', 'C', 'D']); }
    if (skipped) set('skipped', 'Session skipped', true, 'bool');
    if (rest) set('rest', 'Rest day', true, 'bool');
    if (feel) set('feel', 'How it felt', feel, 'choice', 'recognized', ['easy', 'ok', 'hard']);
    if (other.length) set('otherSport', 'Other sport', other.map(cap).join(', '), 'text');

    return { text: raw, date: date, dateNote: dateNote, fields: fields, questions: questions, unmatched: unmatched, matched: matched };
  }

  return { parse: parse, ymd: ymd, addDays: addDays };
})();
