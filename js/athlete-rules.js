/* DugoutLab Athlete Plan: training content and decision rules.
   Layer 1 (what we teach and the rules we follow) and Layer 4 (the plan engine).
   Pure functions, no DOM, no network. athlete.html only renders what this returns.

   Every rule carries an id, a plain-language "why" the athlete or parent sees, and a source key
   from SOURCES. Change a rule here and every athlete's next plan follows it.

   Safety rules baked in (do not remove):
   - No throwing or pitching work. Ever. Pitching is logged as reported workload only.
   - Bodyweight first. Light dumbbells unlock at 13+ when no growth spurt is reported. No barbell.
   - Growth spurt reported: jumping volume comes down, box jumps become step-downs, mobility goes up.
   - Reported discomfort holds the plan. We never diagnose and never clear anyone to play. */
window.DL_RULES = (function () {
  'use strict';

  /* ---------- sources ---------- */
  var SOURCES = {
    ltad: 'Sport for Life, Long-Term Development framework (Balyi et al.). Stage names only. A coaching consensus model, not tested science. Its "windows of trainability" are contested (Ford et al., 2011, J Sports Sci), so ages are guides, not gates.',
    nsca2009: 'Faigenbaum et al. (2009). Youth Resistance Training: Updated Position Statement Paper from the NSCA. J Strength Cond Res. Light loads, correct technique, gradual progression, qualified supervision. Strength 1 to 3 sets of 6 to 15, power 1 to 3 sets of 3 to 6.',
    lloyd2014: 'Lloyd et al. (2014). Position Statement on Youth Resistance Training: the 2014 International Consensus. Br J Sports Med. Resistance training is safe and effective for youth when appropriately prescribed and supervised.',
    lloyd2016ltad: 'Lloyd et al. (2016). NSCA Position Statement on Long-Term Athletic Development. J Strength Cond Res. Readiness over age. Movement competency through childhood.',
    lloyd2016phv: 'Lloyd, Radnor, De Ste Croix, Cronin and Oliver (2016). Changes in sprint and jump performances after traditional, plyometric, and combined resistance training in male youth pre- and post-peak height velocity. J Strength Cond Res 30(5):1239-1247. Plyometrics gave the biggest gains before the growth spurt; combined training after it.',
    bergeron2015: 'Bergeron et al. (2015). International Olympic Committee consensus statement on youth athletic development. Br J Sports Med. Overuse complaints at the knee and heel rise around peak height velocity.',
    webster2018: 'Webster and Hewett (2018). Meta-analysis of meta-analyses of ACL injury reduction training programs. J Orthop Res. Neuromuscular warm-ups cut ACL injury rates by roughly half, mostly studied in soccer, basketball and handball.',
    mandelbaum2005: 'Mandelbaum et al. (2005). Effectiveness of a neuromuscular and proprioceptive training program (PEP) in preventing ACL injuries in female athletes. Am J Sports Med.',
    aap2016: 'Brenner and the AAP Council on Sports Medicine and Fitness (2016). Sports Specialization and Intensive Training in Young Athletes. Pediatrics. Rest days, workload limits and multi-sport play.',
    vanhooren2016: 'Van Hooren and Bosch (2016). Influence of Muscle Slack on High-Intensity Sport Performance: A Review. Strength Cond J 38(5):75-87. Force has to be ready before contact (pre-tension). Reactive landings and unstable loads train that timing.',
    szymanski2007: 'Szymanski et al. (2007). Effect of Twelve Weeks of Medicine Ball Training on High School Baseball Players. J Strength Cond Res. Rotational medicine-ball work in high school hitters.',
    wulf2016: 'Wulf and Lewthwaite (2016). Optimizing performance through intrinsic motivation and attention for learning: the OPTIMAL theory. Psychon Bull Rev. Cues that point outside the body, plus choice, help learning.',
    aspen2019: 'Aspen Institute Project Play and Utah State University (2019). National survey of youth-sports parents. "Not fun anymore" was the most common reason given for a child quitting a sport.',
    ours: 'DugoutLab rule. Our conservative call for parent-led and volunteer-led training. Not a research finding.'
  };

  /* ---------- stages (names from LTAD, content ours) ---------- */
  var STAGES = {
    fun: { key: 'fun', name: 'FUNdamentals', ages: '6 to 9', focus: 'Fall in love with movement', color: '#7A9480',
      goal: 'Build body control through play. Movement variety, not training load. The win is a kid who loves to move and can handle their own bodyweight.' },
    learn: { key: 'learn', name: 'Learn to Train', ages: '10 to 12', focus: 'Explore and build skills', color: '#5C7A62',
      goal: 'A productive stretch for learning how to move: no growth spurt yet and years of practice ahead. Master bodyweight strength, soft landings and clean movement now.' },
    train: { key: 'train', name: 'Train to Train', ages: '13 to 15', focus: 'Through the growth spurt', color: '#C8892A',
      goal: 'Strength and power take off here, and so does injury risk around the growth spurt. Form leads. Light load only when ready, and only with an adult watching.' },
    compete: { key: 'compete', name: 'Train to Compete', ages: '16 to 18', focus: 'Build the real engine', color: '#3E5A43',
      goal: 'After the growth spurt the body is ready for progressive strength and power. Barbell work belongs with a qualified coach in the room, so this plan stays bodyweight-first on purpose.' }
  };
  var STAGE_ORDER = ['fun', 'learn', 'train', 'compete'];
  function stageOf(age) { age = +age || 10; return age <= 9 ? 'fun' : age <= 12 ? 'learn' : age <= 15 ? 'train' : 'compete'; }
  function stageAtLeast(s, min) { return STAGE_ORDER.indexOf(s) >= STAGE_ORDER.indexOf(min); }

  /* ---------- wizard vocab ---------- */
  var GEAR = [
    { id: 'rope', label: 'Jump rope' },
    { id: 'box', label: 'Box, step or sturdy bench' },
    { id: 'medball', label: 'Medicine ball' },
    { id: 'waterbag', label: 'Water bag (aqua bag)' },
    { id: 'bands', label: 'Resistance bands' },
    { id: 'cones', label: 'Cones or markers' },
    { id: 'bar', label: 'Pull-up bar' },
    { id: 'db', label: 'Light dumbbells', minStage: 'train', lockNote: 'Dumbbells unlock at 13 and up, with no growth spurt reported. Bodyweight first.' }
  ];
  var OPTIONS = {
    sport: [['baseball', 'Baseball'], ['softball', 'Softball']],
    position: [['everywhere', 'Everywhere (still trying spots)'], ['infield', 'Infield'], ['outfield', 'Outfield'], ['catcher', 'Catcher'], ['pitcher', 'Pitcher']],
    exp: [['new', 'New to training'], ['some', 'Some (a few months)'], ['exp', 'A year or more']],
    season: [['off', 'Off-season'], ['pre', 'Pre-season'], ['in', 'In-season'], ['tourney', 'Tournament-heavy']],
    goal: [['move', 'Move better'], ['strong', 'Get stronger'], ['fast', 'Get faster'], ['healthy', 'Stay healthy all season'], ['habit', 'Build the habit']],
    spurt: [['no', 'Not yet'], ['yes', 'In one now'], ['unsure', 'Not sure']],
    days: [[2, '2 days'], [3, '3 days'], [4, '4 days']],
    minutes: [[10, '10 min'], [20, '20 min'], [30, '30 min']],
    discomfort: [['none', 'Nothing'], ['knee', 'Knee or heel'], ['arm', 'Arm or shoulder'], ['back', 'Back'], ['other', 'Something else']],
    who: [['parent', 'A parent runs it'], ['coach', 'A coach runs it'], ['athlete', 'The athlete runs it, a parent checks in']],
    feel: [['easy', 'Easy'], ['ok', 'Just right'], ['hard', 'Hard']]
  };
  function label(group, v) { var o = OPTIONS[group] || []; for (var i = 0; i < o.length; i++) if (String(o[i][0]) === String(v)) return o[i][1]; return String(v == null ? '' : v); }

  /* ---------- doses ---------- */
  /* Strength sets x reps by stage and tier (0 start, 1, 2). Inside NSCA 1 to 3 sets of 6 to 15. */
  var STRENGTH = { fun: [[1, 10], [2, 10], [2, 12]], learn: [[2, 8], [2, 10], [3, 10]], train: [[2, 8], [3, 8], [3, 10]], compete: [[3, 8], [3, 10], [4, 8]] };
  /* Power sets x reps by stage. NSCA 1 to 3 sets of 3 to 6. */
  var POWER = { fun: [1, 5], learn: [2, 5], train: [2, 5], compete: [3, 5] };
  var DEFAULTS = { tierFor: { new: 0, some: 1, exp: 1 }, maxTier: 2 };

  /* Week wave inside a 4-week block: learn it, add a little, best week, deload. */
  var WEEKS = [
    { n: 1, name: 'Learn it', note: 'Easy end of every range. Two reps left in the tank.' },
    { n: 2, name: 'Add a little', note: 'One more rep per set, or a touch more control.' },
    { n: 3, name: 'Best week', note: 'Top of the range. Best quality reps. The hardest week.' },
    { n: 4, name: 'Deload', note: 'Fewer sets. Move well, recover, feel fresh.' }
  ];
  function wave(sets, reps, weekNo, isPower) {
    weekNo = weekNo || 1;
    if (weekNo === 1) return [sets, isPower ? reps : Math.max(5, reps - 2)];
    if (weekNo === 3) return [sets, isPower ? reps : reps + 2];
    if (weekNo === 4) return [Math.max(1, sets - 1), reps];
    return [sets, reps];
  }
  function doseText(sr, each) { return sr[0] + ' x ' + sr[1] + (each ? ' each' : ''); }

  /* ---------- rules (id, why, source) ---------- */
  var RULES = {
    stage: { src: ['ltad', 'ours'], why: function (s) { return 'Age sets the starting stage: ' + STAGES[s].name + ' (' + STAGES[s].ages + '). Ages are guides, not gates. Girls often reach the next stage a year or two earlier, so train the athlete in front of you.'; } },
    bodyweight: { src: ['nsca2009', 'lloyd2014', 'ours'], why: 'Bodyweight first. The research allows supervised light loads at every age; our default for home and volunteer-led training is to master bodyweight patterns before adding any weight.' },
    dbUnlock: { src: ['nsca2009', 'ours'], why: 'Light dumbbells are in because the athlete is 13 or older with no growth spurt reported. Form leads. An adult watches every loaded set.' },
    dbLocked: { src: ['ours'], why: 'Dumbbells stay out of this plan. They unlock at 13 and up with no growth spurt reported.' },
    spurt: { src: ['bergeron2015', 'ours'], why: 'Growth spurt reported. Overuse complaints at the knee and heel rise in this window, so jumping volume comes down, box jumps become step-downs, and mobility goes up. Reported by you, not a diagnosis.' },
    spurtUnsure: { src: ['bergeron2015'], why: 'Not sure about a growth spurt? Watch for a fast height jump, a new shoe size, new clumsiness, or sore knees or heels. If you see those, answer "In one now" at the next check-in.' },
    warm: { src: ['webster2018', 'mandelbaum2005'], why: 'Every session opens with a short neuromuscular warm-up: soft landings, single-leg balance, light hops. Programs like this cut ACL injury rates by roughly half in meta-analyses.' },
    move: { src: ['vanhooren2016', 'lloyd2016phv'], why: 'The Move block trains timing, not just force: land, stick, bounce. Force has to be ready before contact. Before the growth spurt, this kind of work produced the biggest sprint and jump gains in one controlled study.' },
    waterbag: { src: ['vanhooren2016', 'ours'], why: 'Water bag work is in because you have one. The shifting load forces the body to brace before it moves. Promising and plausible, not yet tested in youth. Keep it light, half full, and low rep.' },
    medball: { src: ['szymanski2007'], why: 'Light rotational medicine-ball throws are in because you have a ball. Studied in high school hitters.' },
    dose: { src: ['nsca2009'], why: 'Sets and reps sit inside the NSCA youth ranges: strength 1 to 3 sets of 6 to 15, power 1 to 3 sets of 3 to 6.' },
    season: { src: ['aap2016', 'ours'], why: 'In-season or tournament-heavy: the plan caps at 2 short sessions a week so games and practices stay the priority and rest days survive.' },
    heavy: { src: ['aap2016', 'ours'], why: 'Five or more games and practices this week counts as a heavy week. The plan drops to 2 short sessions until it eases.' },
    knee: { src: ['bergeron2015', 'ours'], why: 'Knee or heel discomfort reported. No hopping or jumping this week. The Move block becomes balance, step-downs and mobility. If it lasts two weeks, have a professional look.' },
    arm: { src: ['ours'], why: 'Arm or shoulder discomfort reported. This plan has no throwing work by design and now skips overhead and throwing moves too. Pitch counts and rest days live in the Pitch Tracker.' },
    back: { src: ['ours'], why: 'Back discomfort reported. Rotational throws and loaded carries come out. Core work goes to dead bugs and bird dogs. If it lasts two weeks, have a professional look.' },
    other: { src: ['ours'], why: 'Something else reported. The plan holds at the easiest dose until it clears. We do not diagnose; if it lasts, have a professional look.' },
    progress: { src: ['nsca2009', 'ours'], why: '2-for-2 rule: two weeks in a row with every session done and nothing rated hard moves the dose up one notch.' },
    smaller: { src: ['ours'], why: 'Fewer than half the sessions happened. Smaller is fine. Showing up is the skill, so the plan shrinks to fit the week.' },
    hold: { src: ['nsca2009'], why: 'Two sessions felt hard. The dose holds. Progression is gradual on purpose.' },
    deload: { src: ['nsca2009', 'ours'], why: 'Week 4 is a deload: fewer sets, same moves. Then a new block starts.' },
    play: { src: ['aspen2019', 'wulf2016'], why: 'Play is in the plan on purpose. Not fun anymore is the top reason kids quit, and choosing the game is part of learning.' },
    noThrow: { src: ['ours'], why: 'No throwing or pitching work lives in this plan. Throwing volume has to be managed by someone who can see the athlete and the real game schedule.' },
    cues: { src: ['wulf2016'], why: 'Cues point outside the body (quiet feet, push the floor away) instead of at body parts.' }
  };
  function why(id, arg) { var r = RULES[id]; return { rule: id, text: typeof r.why === 'function' ? r.why(arg) : r.why, sources: r.src.slice() }; }

  /* ---------- exercise library (gear-aware pickers) ---------- */
  function ex(id, name, dose, cue, extra) { var o = { id: id, name: name, dose: dose, cue: cue || '' }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function has(g, id) { return g.indexOf(id) >= 0; }

  function warmBlock(stage, g, f, wk) {
    var items = [];
    if (stage === 'fun') {
      items.push(ex('animal', 'Animal walks: bear, crab, frog', '2 min', 'Low like a crab, long like a bear.'));
      items.push(ex('tag', 'Tag or a relay', '2 min', 'Fast feet, soft steps.'));
      items.push(ex('skip', 'Skips and hops, land soft', '1 min', 'Quiet feet.'));
      return items;
    }
    items.push(ex('dyn', 'Dynamic warm-up: skips, walking lunges, leg swings', '3 min', 'Loose and tall.'));
    items.push(ex('land', 'Knee-over-toe landing drill: small hop, land soft, hold', doseText(wave(2, 5, wk, true)), 'Land like a ninja. Knees over toes.'));
    items.push(ex('bal', 'Single-leg balance, eyes up', '30 sec each', 'Pick a spot on the wall and hold it.'));
    items.push(f.noJump ? ex('latstep', 'Lateral steps, soft and slow', '2 x 6 each', 'Push the ground away sideways.')
      : ex('lathop', 'Lateral hops, soft', doseText(wave(2, f.spurt ? 4 : 6, wk, true), true), 'Quiet feet.'));
    return items;
  }

  function moveBlock(stage, g, f, wk) {
    var p = POWER[stage], items = [];
    if (f.noJump) {
      items.push(ex('bal2', 'Single-leg balance with a slow reach', '2 x 5 each', 'Reach for the floor, stay tall.'));
      items.push(ex('stepdown', 'Slow step-down off a step', '2 x 5 each', 'Three seconds down. Quiet landing.'));
      items.push(ex('mob', 'Hip and ankle mobility flow', '2 rounds', 'Slow and smooth.'));
      items.push(ex('lunge', 'Walking lunges, slow', '2 x 6 each', 'Tall chest, soft knee.'));
      return items;
    }
    var sets = f.spurt ? Math.max(1, p[0] - 1) : p[0];
    items.push(f.spurt ? ex('pogo-low', 'Low pogo hops, quiet feet', doseText(wave(sets, 6, wk, true)), 'Bounce like the floor is hot. Tiny and quiet.')
      : ex('pogo', 'Pogo hops, quiet feet', doseText(wave(p[0], 10, wk, true)), 'Bounce like the floor is hot. Quiet feet.'));
    if (has(g, 'box')) items.push(f.spurt ? ex('stepdown', 'Step down off the box, slow, stick it', doseText(wave(sets, 5, wk, true), true), 'Three seconds down. Freeze on landing.')
      : ex('stick', 'Step off the box, stick the landing', doseText(wave(p[0], p[1], wk, true)), 'Freeze when you land. Count to two.'));
    else items.push(f.spurt ? ex('curb', 'Slow step-down off a stair or curb', doseText(wave(sets, 5, wk, true), true), 'Three seconds down. Quiet landing.')
      : ex('sqjump', 'Squat jump, stick the landing', doseText(wave(p[0], p[1], wk, true)), 'Freeze when you land. Count to two.'));
    items.push(f.spurt ? ex('skaterhold', 'Lateral step and hold (skater, no hop)', '2 x 4 each', 'Land on one foot and stay.')
      : ex('skater', 'Lateral bound and hold (skater)', doseText(wave(p[0], 4, wk, true), true), 'Land on one foot and stay.'));
    if (has(g, 'waterbag') && !f.noBack) items.push(ex('wb-stride', 'Water bag stride and stick (light, half full)', doseText(wave(2, 5, wk, true), true), 'Stride, plant, freeze. Let the water settle before the next one.'));
    else if (has(g, 'medball') && !f.noOverhead && !f.noBack) items.push(ex('mb-rot', 'Medicine-ball rotational throw, light', doseText(wave(2, 6, wk, true), true), 'Throw it through the wall.'));
    else if (has(g, 'bands') && !f.noBack) items.push(ex('band-rot', 'Band rotation, slow and controlled', '2 x 8 each', 'Turn the belt buckle to the wall.'));
    else items.push(ex('shadow', 'Shadow swings, stick the front foot', '2 x 6', 'Front foot lands and freezes.'));
    return items;
  }

  function strengthBlock(stage, g, f, wk, tier, short) {
    var items = [];
    if (stage === 'fun') {
      items.push(ex('statue', 'Squat and freeze like a statue', '2 x 8', 'Sit on an invisible chair.'));
      items.push(ex('hi5', 'Push-up high fives (knees are fine)', '2 x 6', 'Body like a board.'));
      items.push(ex('crawl', 'Bear crawl there, crab walk back', '3 trips', 'Low and slow.'));
      if (!short) items.push(ex('plankgame', 'Plank hold game: who moves first?', '2 x 20 sec', 'Still as a table.'));
      if (!short) items.push(ex('carry-fun', 'Carry something heavy to the line and back', '2 trips', 'Hug it tight, walk tall.'));
      return items;
    }
    var sr = STRENGTH[stage][Math.min(tier, DEFAULTS.maxTier)], d = doseText(wave(sr[0], sr[1], wk));
    items.push(f.loadOK && has(g, 'db') ? ex('goblet', 'Goblet squat, light dumbbell', d, 'Push the floor away.') : ex('squat', 'Bodyweight squat, sit back', d, 'Push the floor away.'));
    items.push(ex('pushup', 'Push-up (hands on a step if needed)', d, 'Body like a plank.'));
    items.push(has(g, 'bar') && !f.noOverhead ? ex('invrow', 'Inverted row under the bar', d, 'Pull the bar to you.')
      : has(g, 'bands') ? ex('bandrow', 'Band row', d, 'Pull the band to your pockets.')
      : ex('tablerow', 'Table row (under a sturdy table)', d, 'Pull the table to you.'));
    if (!short) {
      items.push(has(g, 'bands') && !f.noBack ? ex('bandgm', 'Band good morning', d, 'Push your hips to the wall behind you.')
        : ex('airplane', 'Single-leg airplane (hip hinge)', doseText(wave(sr[0], 6, wk), true), 'Reach your heel to the wall behind you.'));
    }
    items.push(f.noBack ? ex('deadbug', 'Dead bug, slow', '2 x 8 each', 'Press your back into the floor.')
      : has(g, 'bands') ? ex('pallof', 'Pallof press (band)', '2 x 8 each', 'Do not let the band turn you.')
      : ex('plank', 'Plank, then side plank', '2 x 20-30 sec', 'Still as a table.'));
    if (!short && !f.noBack) {
      items.push(has(g, 'waterbag') ? ex('wb-carry', 'Water bag bear-hug carry', '2-3 trips', 'Hug it tight, walk tall.')
        : f.loadOK && has(g, 'db') ? ex('suitcase', 'Suitcase carry, one dumbbell', '2-3 trips', 'Stay tall. Do not lean.')
        : ex('bearhug', 'Bear-hug carry (anything heavy-ish)', '2-3 trips', 'Hug it tight, walk tall.'));
    }
    return items;
  }

  function playBlock(stage, g, f) {
    if (stage === 'fun') return [ex('play-pick', 'Pick one: tag, a relay, an obstacle course, or throw and catch with a different ball', 'until time is up', 'You pick.'), ex('free', 'Free play. Any sport.', 'the rest', '')];
    var items = [ex('play-sport', 'Free play: another sport, bike, pickup anything', 'most of the time', 'You pick the game.')];
    if (has(g, 'rope') && !f.noJump) items.push(ex('rope', 'Easy jump rope', '3 x 30 sec', 'Tiny bounces.'));
    items.push(ex('mob2', 'Hip flow and mobility', '1 round', 'Slow and smooth.'));
    return items;
  }

  /* ---------- flags from the profile ---------- */
  function flagsFor(p) {
    var stage = stageOf(p.age), d = p.discomfort || 'none';
    var spurt = p.spurt === 'yes';
    return {
      stage: stage, spurt: spurt,
      noJump: d === 'knee', noOverhead: d === 'arm', noBack: d === 'back',
      holdTier: d !== 'none',
      loadOK: stageAtLeast(stage, 'train') && !spurt && d === 'none'
    };
  }
  function gearAllowed(p, id) {
    var g = null; for (var i = 0; i < GEAR.length; i++) if (GEAR[i].id === id) g = GEAR[i];
    if (!g || !g.minStage) return true;
    var f = flagsFor(p); return stageAtLeast(f.stage, g.minStage) && !f.spurt;
  }

  /* ---------- the plan ---------- */
  /* profile p: { nickname, age, sport, positions[], exp, season, goal, spurt, workload:{practices,games,otherSport,throws}, days, minutes, gear[], discomfort, who }
     state st: { tier, weekNo (1-4), blockNo, version } */
  function buildPlan(p, st) {
    st = st || {};
    var f = flagsFor(p), stage = f.stage, g = (p.gear || []).filter(function (id) { return gearAllowed(p, id); });
    var wk = st.weekNo || 1, tier = f.holdTier ? 0 : Math.min(st.tier == null ? DEFAULTS.tierFor[p.exp] || 0 : st.tier, DEFAULTS.maxTier);
    var W = [], days = +p.days || 3, minutes = +p.minutes || 20;
    var wl = p.workload || {}, heavy = ((+wl.games || 0) + (+wl.practices || 0)) >= 5;
    var inSeason = p.season === 'in' || p.season === 'tourney';

    W.push(why('stage', stage));
    if (inSeason) { days = Math.min(days, 2); minutes = Math.min(minutes, 20); W.push(why('season')); }
    else if (heavy) { days = Math.min(days, 2); minutes = Math.min(minutes, 20); W.push(why('heavy')); }
    if (f.spurt) W.push(why('spurt')); else if (p.spurt === 'unsure') W.push(why('spurtUnsure'));
    if (f.noJump) W.push(why('knee'));
    if (f.noOverhead) W.push(why('arm'));
    if (f.noBack) W.push(why('back'));
    if ((p.discomfort || 'none') === 'other') W.push(why('other'));
    if (stage !== 'fun') W.push(why('warm'));
    W.push(why('move'));
    if (has(g, 'waterbag') && !f.noBack) W.push(why('waterbag'));
    else if (has(g, 'medball') && !f.noOverhead && !f.noBack) W.push(why('medball'));
    W.push(why('bodyweight'));
    if ((p.gear || []).indexOf('db') >= 0) W.push(why(f.loadOK ? 'dbUnlock' : 'dbLocked'));
    W.push(why('dose'));
    if (wk === 4) W.push(why('deload'));
    W.push(why('play'));
    W.push(why('noThrow'));

    /* session templates by minutes: which blocks, in order */
    var T;
    if (minutes <= 10) T = [['A', 'Move', ['warm', 'move']], ['B', 'Strength', ['warm', 'strength']]];
    else if (minutes <= 20) T = [['A', 'Move + Strength', ['warm', 'move', 'strength']], ['B', 'Move + Play', ['warm', 'move', 'play']], ['C', 'Strength + Play', ['warm', 'strength', 'play']]];
    else T = [['A', 'Move + Strength + Play', ['warm', 'move', 'strength', 'play']], ['B', 'Move + Play', ['warm', 'move', 'play']], ['C', 'Strength + Play', ['warm', 'strength', 'play']]];
    if (stage === 'fun') T = T.map(function (t) { var b = t[2].slice(); if (b.indexOf('play') < 0) b.push('play'); return [t[0], t[1].indexOf('Play') < 0 ? t[1] + ' + Play' : t[1], b]; });
    var order = days === 2 ? [0, 1] : days === 3 ? [0, 1, T.length > 2 ? 2 : 0] : [0, 1, T.length > 2 ? 2 : 0, T.length > 2 ? 0 : 1];
    var BLOCK_NAMES = { warm: 'Warm-up', move: 'Move: land, stick, bounce', strength: stage === 'fun' ? 'Strong, as a game' : 'Strength', play: 'Play' };
    var BLOCK_COLORS = { warm: '#6E8F74', move: '#C8862E', strength: '#3E5A43', play: '#7A9480' };

    var sessions = order.map(function (ti, i) {
      var t = T[ti], short = minutes <= 10, blocks = [];
      var warmMin = minutes <= 10 ? 3 : minutes <= 20 ? 4 : 5, rest = minutes - warmMin, others = t[2].length - 1, each = Math.max(3, Math.round(rest / Math.max(1, others)));
      t[2].forEach(function (b) {
        var items = b === 'warm' ? warmBlock(stage, g, f, wk) : b === 'move' ? moveBlock(stage, g, f, wk) : b === 'strength' ? strengthBlock(stage, g, f, wk, tier, short) : playBlock(stage, g, f);
        blocks.push({ key: b, name: BLOCK_NAMES[b], color: BLOCK_COLORS[b], minutes: b === 'warm' ? warmMin : each, items: items });
      });
      return { idx: i, tag: String.fromCharCode(65 + i), name: t[1], minutes: minutes, blocks: blocks };
    });

    return {
      version: st.version || 1, stage: STAGES[stage], tier: tier, weekNo: wk, week: WEEKS[wk - 1], blockNo: st.blockNo || 1,
      days: days, minutes: minutes, spurt: f.spurt, hold: p.discomfort || 'none', gear: g, loadOK: f.loadOK,
      sessions: sessions, why: W, cues: why('cues')
    };
  }

  /* ---------- weekly review ---------- */
  /* week: { planned, done, feels:{easy,ok,hard} }  checkin: { spurt, discomfort, season, games, practices, otherSport, pitched } */
  function reviewWeek(p, st, week, c) {
    var np = JSON.parse(JSON.stringify(p)), ns = JSON.parse(JSON.stringify(st || {})), changes = [], flags = [];
    np.workload = np.workload || {}; week = week || { planned: 0, done: 0, feels: { easy: 0, ok: 0, hard: 0 } }; c = c || {};
    ns.tier = ns.tier == null ? (DEFAULTS.tierFor[p.exp] || 0) : ns.tier;
    ns.easyStreak = ns.easyStreak || 0; ns.holdWeeks = ns.holdWeeks || 0; ns.weekNo = ns.weekNo || 1; ns.blockNo = ns.blockNo || 1; ns.version = ns.version || 1;
    function add(id, text) { var w = why(id); if (text) w.text = text; changes.push(w); }

    /* carry forward, then apply what changed */
    if (c.season && c.season !== p.season) { np.season = c.season; add('season', 'Season changed to ' + label('season', c.season) + '. ' + (c.season === 'in' || c.season === 'tourney' ? RULES.season.why : 'Full days and minutes are back.')); }
    if (c.spurt && c.spurt !== p.spurt) { np.spurt = c.spurt; if (c.spurt === 'yes') add('spurt'); else add('spurt', 'Growth spurt no longer reported. Jumping volume comes back one step at a time.'); }
    if (c.discomfort !== undefined && c.discomfort !== null) {
      if (c.discomfort !== (p.discomfort || 'none')) {
        np.discomfort = c.discomfort; ns.holdWeeks = c.discomfort === 'none' ? 0 : 1;
        if (c.discomfort === 'none') add('hold', 'Discomfort cleared. The plan comes back to the normal dose.'); else add(c.discomfort);
      } else if (c.discomfort !== 'none') {
        ns.holdWeeks += 1;
        if (ns.holdWeeks >= 2) flags.push('Two weeks of the same ' + label('discomfort', c.discomfort).toLowerCase() + ' discomfort. Have a professional look before continuing that part of the plan. We do not diagnose.');
      }
    }
    if (c.games != null) np.workload.games = +c.games || 0;
    if (c.practices != null) np.workload.practices = +c.practices || 0;
    if (c.otherSport != null) np.workload.otherSport = !!c.otherSport;
    var heavy = (np.workload.games + np.workload.practices) >= 5;
    if (heavy && !((p.workload.games || 0) + (p.workload.practices || 0) >= 5)) add('heavy');
    if (c.pitched || c.discomfort === 'arm') flags.push('Pitching and arm fatigue are logged as reported, nothing more. This plan has no throwing work by design. Pitch counts and rest days live in the Pitch Tracker.');

    /* completion and feel */
    var rate = week.planned ? week.done / week.planned : 0, hold = np.discomfort && np.discomfort !== 'none', spurt = np.spurt === 'yes';
    if (week.planned && rate >= 0.8 && week.feels.hard === 0 && week.feels.easy >= 2) {
      ns.easyStreak += 1;
      if (ns.easyStreak >= 2 && ns.tier < DEFAULTS.maxTier && !hold && !spurt) { ns.tier += 1; ns.easyStreak = 0; add('progress'); }
      else if (ns.easyStreak >= 2 && ns.tier >= DEFAULTS.maxTier) { flags.push('Top of the dose range for this stage. The next step up is a harder variation of each move, with an adult watching, not more weight.'); }
      else if (ns.easyStreak === 1) flags.push('One more week like this and the dose steps up (2-for-2 rule).');
    } else ns.easyStreak = 0;
    if (week.planned >= 2 && rate < 0.5) {
      if (np.days > 2) np.days -= 1; else if (np.minutes > 10) np.minutes = np.minutes >= 30 ? 20 : 10;
      add('smaller');
    }
    if (week.feels.hard >= 2) { ns.easyStreak = 0; add('hold'); }

    /* the 4-week wave */
    if (ns.weekNo >= 4) { ns.weekNo = 1; ns.blockNo += 1; flags.push('New block. Week 1 again: learn it, easy end of every range.'); }
    else { ns.weekNo += 1; if (ns.weekNo === 4) add('deload'); }
    ns.version += 1;
    ns.lastCheckin = c.date || null;

    var summary = {
      planned: week.planned, done: week.done, rate: Math.round(rate * 100), feels: week.feels,
      games: np.workload.games, practices: np.workload.practices, otherSport: !!np.workload.otherSport,
      line: (week.done + ' of ' + week.planned + ' sessions done. ') +
        (week.feels.hard ? week.feels.hard + ' felt hard. ' : '') + (week.feels.easy ? week.feels.easy + ' felt easy. ' : '') +
        (np.workload.games || np.workload.practices ? np.workload.games + (np.workload.games === 1 ? ' game and ' : ' games and ') + np.workload.practices + (np.workload.practices === 1 ? ' practice reported. ' : ' practices reported. ') : '') +
        (changes.length ? changes.length + (changes.length === 1 ? ' change' : ' changes') + ' for next week.' : 'No changes for next week.')
    };
    return { profile: np, state: ns, changes: changes, flags: flags, summary: summary };
  }

  /* Count a week of logged entries. entries: [{date, kind:'session', data:{feel, done:true}}] within [since, until] */
  function summarizeEntries(entries, since, until, planned) {
    var done = 0, feels = { easy: 0, ok: 0, hard: 0 };
    (entries || []).forEach(function (e) {
      if (e.kind !== 'session' || !e.data || !e.data.done) return;
      if (since && e.date < since) return; if (until && e.date > until) return;
      done += 1; if (feels[e.data.feel] != null) feels[e.data.feel] += 1;
    });
    return { planned: planned || 0, done: done, feels: feels };
  }

  return { SOURCES: SOURCES, STAGES: STAGES, GEAR: GEAR, OPTIONS: OPTIONS, RULES: RULES, WEEKS: WEEKS, DEFAULTS: DEFAULTS,
    stageOf: stageOf, gearAllowed: gearAllowed, label: label, buildPlan: buildPlan, reviewWeek: reviewWeek, summarizeEntries: summarizeEntries, why: why };
})();
