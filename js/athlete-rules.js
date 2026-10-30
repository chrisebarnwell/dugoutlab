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
    alphafit: 'Ruiz et al. (2011). Field-based fitness assessment in young people: the ALPHA health-related fitness test battery for children and adolescents. Br J Sports Med 45:518-524. The standing broad jump is a valid, reliable field test of lower-body muscular fitness in youth.',
    fitnessgram: 'The Cooper Institute. FITNESSGRAM Test Administration Manual. Youth push-up and trunk tests. Our 30-second push-up count is an adapted version, not the official test.',
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
    tests: { src: ['alphafit', 'fitnessgram', 'ours'], why: 'Test day opens every 4-week block: six quick tests, about 10 minutes. Each kid beats only their own last number. No norms, no rankings, no comparing kids.' },
    rotate: { src: ['ours'], why: 'Moves rotate every 4-week block and differ between sessions. Each move stays put for a block, long enough to beat last week, then a new variation keeps it fresh.' },
    cues: { src: ['wulf2016'], why: 'Cues point outside the body (quiet feet, push the floor away) instead of at body parts.' }
  };
  function why(id, arg) { var r = RULES[id]; return { rule: id, text: typeof r.why === 'function' ? r.why(arg) : r.why, sources: r.src.slice() }; }

  /* ---------- move library ----------
     Every move: id (also the demo file name: assets/moves/<id>.mp4), slot, name, cue (points outside the body),
     and options: min stage, gear needed, dose type, and safety tags.
       jump: impact or landing work          (out when knee or heel discomfort is reported)
       overhead: arms overhead or throwing   (out when arm or shoulder discomfort is reported)
       back: spinal load or rotation         (out when back discomfort is reported)
       load: external weight                 (only when loadOK: 13+, no growth spurt, nothing sore)
       spurtOK: jump move gentle enough for a reported growth spurt
     Dose types: str (strength sets x reps), pow (power sets x reps), hop (10 contacts), hold (seconds),
       trip (carries), or a fixed string. each: per side.
     Moves rotate every 4-week block and differ between sessions A, B and C, so the plan stays fresh while a
     move holds steady long enough to beat last week's number. */
  var LIB = [];
  function L(slot, id, name, cue, o) { o = o || {}; o.slot = slot; o.id = id; o.name = name; o.cue = cue; LIB.push(o); }

  /* warm-up, 10 and up */
  L('prep', 'prep-skip', 'Skips, walking lunges, leg swings', 'Loose and tall.', { dose: '3 min' });
  L('prep', 'prep-world', 'World\'s greatest stretch, then high-knee march', 'Reach for the ceiling.', { dose: '3 min' });
  L('prep', 'prep-inch', 'Inchworm walkouts, then side shuffles', 'Hands walk out, feet walk in.', { dose: '3 min' });
  L('land', 'land-ko', 'Knee-over-toe landing drill: small hop, land soft, hold', 'Land like a ninja. Knees over toes.', { dose: '2 x 5', jump: 1, spurtOK: 1 });
  L('land', 'land-drop', 'Drop and freeze: rise on your toes, drop into a quiet half squat', 'Freeze like a photo.', { dose: '2 x 5' });
  L('land', 'land-snap', 'Snap down: arms up, snap into an athletic stance, freeze', 'Make no sound.', { dose: '2 x 5' });
  L('bal', 'bal-eyes', 'Single-leg balance, eyes up', 'Pick a spot on the wall and hold it.', { dose: '30 sec each' });
  L('bal', 'bal-reach', 'Single-leg balance with a three-way toe reach', 'Tap the clock: 12, 3, 6.', { dose: '2 x 3 each' });
  L('bal', 'bal-catch', 'Single-leg balance, toss and catch a ball', 'Eyes on the ball, quiet foot.', { dose: '30 sec each' });
  L('bal', 'bal-closed', 'Single-leg balance, eyes closed', 'Grow tall through the top of your head.', { dose: '20 sec each', min: 'train' });
  L('lat', 'lat-hop', 'Lateral hops over a line, soft', 'Quiet feet.', { dose: '2 x 6 each', jump: 1 });
  L('lat', 'lat-shuffle', 'Athletic shuffle, quick feet', 'Stay low, never cross your feet.', { dose: '2 x 10 yd each way' });
  L('lat', 'lat-carioca', 'Carioca (grapevine)', 'Hips turn, shoulders stay square.', { dose: '2 x 10 yd each way' });

  /* warm-up, 6 to 9 */
  L('f-animal', 'f-animal-1', 'Animal walks: bear, crab, frog', 'Low like a crab, long like a bear.', { dose: '2 min' });
  L('f-animal', 'f-animal-2', 'Animal walks: gorilla, duck, inchworm', 'Big gorilla, tiny duck.', { dose: '2 min' });
  L('f-animal', 'f-animal-3', 'Animal walks: penguin, bear, kangaroo hops', 'Kangaroos land quiet.', { dose: '2 min', jump: 1 });
  L('f-game', 'f-tag', 'Tag or a relay', 'Fast feet, soft steps.', { dose: '2 min' });
  L('f-game', 'f-redlight', 'Red light, green light', 'Freeze like a statue.', { dose: '2 min' });
  L('f-game', 'f-sharks', 'Sharks and minnows', 'Dodge, do not crash.', { dose: '2 min' });
  L('f-game', 'f-simon', 'Simon says, athlete version', 'Listen, then move.', { dose: '2 min' });
  L('f-hop', 'f-skip', 'Skips and hops, land soft', 'Quiet feet.', { dose: '1 min', jump: 1, spurtOK: 1 });
  L('f-hop', 'f-hopscotch', 'Hopscotch', 'Land on the number, quiet.', { dose: '1 min', jump: 1 });
  L('f-hop', 'f-beam', 'Balance beam walk on a line', 'Arms out like a plane.', { dose: '1 min' });

  /* move: hops */
  L('hop', 'pogo', 'Pogo hops, quiet feet', 'Bounce like the floor is hot.', { dose: 'hop', jump: 1 });
  L('hop', 'pogo-fb', 'Forward-back pogo over a line', 'Tiny and fast over the line.', { dose: 'hop', jump: 1 });
  L('hop', 'pogo-ss', 'Side-to-side pogo over a line', 'Quick off the ground.', { dose: 'hop', jump: 1 });
  L('hop', 'pogo-1', 'Single-leg pogo, small', 'Bounce off the ball of the foot.', { dose: '2 x 6 each', jump: 1, min: 'learn' });
  L('hop', 'rope', 'Jump rope, two feet', 'Tiny bounces.', { dose: '2 x 30 sec', jump: 1, gear: 'rope', spurtOK: 1 });
  L('hop', 'line-hops', 'Line hops: in, out, like a ladder', 'Hit the spaces fast.', { dose: 'hop', jump: 1 });
  L('hop-s', 'pogo-low', 'Low pogo hops, tiny and quiet', 'Tiny like a mouse.', { dose: '2 x 6', jump: 1, spurtOK: 1 });
  L('hop-s', 'ankle-bounce', 'Ankle bounces, heels stay up', 'Springy, not high.', { dose: '2 x 8', jump: 1, spurtOK: 1 });
  /* move: stick the landing */
  L('stick', 'step-stick', 'Step off the box, stick the landing', 'Freeze when you land. Count to two.', { dose: 'pow', jump: 1, gear: 'box' });
  L('stick', 'sqj-stick', 'Squat jump, stick the landing', 'Freeze when you land. Count to two.', { dose: 'pow', jump: 1 });
  L('stick', 'broad-stick', 'Broad jump, stick it', 'Jump out, land like a statue.', { dose: 'pow', jump: 1, min: 'learn' });
  L('stick', 'turn-stick', 'Jump, turn a quarter, stick it', 'Land facing the new wall.', { dose: 'pow', jump: 1, min: 'learn' });
  L('stick', 'hop-stick-1', 'Short hop on one leg and stick', 'Land and own it for two.', { dose: '2 x 4 each', jump: 1, min: 'train' });
  L('stick-s', 'stepdown', 'Slow step-down off a step', 'Three seconds down. Quiet landing.', { dose: '2 x 5 each' });
  L('stick-s', 'drop-freeze', 'Drop into a half squat and freeze', 'Freeze like a photo.', { dose: '2 x 5' });
  /* move: lateral */
  L('lat2', 'skater', 'Lateral bound and hold (skater)', 'Land on one foot and stay.', { dose: '2 x 4 each', jump: 1 });
  L('lat2', 'line-stick', 'Lateral hop over a line and stick', 'Land on the far foot, freeze.', { dose: '2 x 4 each', jump: 1 });
  L('lat2', 'cross-stick', 'Crossover step and stick', 'Push the ground sideways.', { dose: '2 x 4 each' });
  L('lat2', 'cone-reach', 'Lateral bound to a cone, reach and stick', 'Touch the cone, stay balanced.', { dose: '2 x 4 each', jump: 1, gear: 'cones', min: 'learn' });
  L('lat-s', 'skater-step', 'Lateral step and hold (skater, no hop)', 'Land on one foot and stay.', { dose: '2 x 4 each' });
  L('lat-s', 'lat-lunge-bal', 'Lateral lunge to a balance', 'Push back to one foot and freeze.', { dose: '2 x 4 each' });
  /* move: reactive and rotational */
  L('react', 'wb-stride', 'Water bag stride and stick (light, half full)', 'Stride, plant, freeze. Let the water settle.', { dose: '2 x 5 each', gear: 'waterbag', back: 1 });
  L('react', 'wb-shuffle', 'Water bag hold: quick shuffle and stop', 'Stop the water, not just your feet.', { dose: '2 x 4 each', gear: 'waterbag', back: 1 });
  L('react', 'wb-lunge', 'Water bag reverse lunge, hug it tight', 'Keep the water quiet.', { dose: '2 x 5 each', gear: 'waterbag', back: 1 });
  L('react', 'mb-rot', 'Medicine-ball rotational throw into a wall', 'Throw it through the wall.', { dose: '2 x 6 each', gear: 'medball', back: 1 });
  L('react', 'mb-chest', 'Medicine-ball chest pass to a wall', 'Push the ball through the bricks.', { dose: '2 x 8', gear: 'medball' });
  L('react', 'mb-step', 'Medicine-ball step-behind rotational throw', 'Step, turn, throw it through the wall.', { dose: '2 x 5 each', gear: 'medball', back: 1, min: 'train' });
  L('react', 'band-rot', 'Band rotation, slow and controlled', 'Turn the belt buckle to the wall.', { dose: '2 x 8 each', gear: 'bands', back: 1 });
  L('react', 'shadow', 'Shadow swings, stick the front foot', 'Front foot lands and freezes.', { dose: '2 x 6', back: 1, overhead: 1 });
  L('react', 'drop-ball', 'Drop-ball reaction: catch it before the second bounce', 'Eyes on the ball, first step fast.', { dose: '2 x 5' });
  L('react', 'mirror', 'Mirror drill: shuffle and stop with a partner', 'Copy the leader, stop on a dime.', { dose: '3 x 15 sec' });
  /* move: speed (30-minute sessions) */
  L('speed', 'fall-start', 'Falling start: lean, fall, sprint 10 yards', 'Let the lean pull you out.', { dose: '4 reps', jump: 1 });
  L('speed', 'wall-march', 'Wall march: drive the knee', 'Push the wall away, knee to the sky.', { dose: '2 x 8 each' });
  L('speed', 'chase', 'Chase: partner gets a two-step head start, 10 yards', 'Catch them before the line.', { dose: '4 reps', jump: 1 });
  L('speed', 'getup-go', 'Get-up and go: lie down, pop up, sprint 10 yards', 'Fastest first step wins.', { dose: '4 reps', jump: 1 });
  /* move: knee or heel reported (no impact) */
  L('nj', 'bal2', 'Single-leg balance with a slow reach', 'Reach for the floor, stay tall.', { dose: '2 x 5 each' });
  L('nj', 'stepdown-nj', 'Slow step-down off a step', 'Three seconds down. Quiet landing.', { dose: '2 x 5 each' });
  L('nj', 'mob', 'Hip and ankle mobility flow', 'Slow and smooth.', { dose: '2 rounds' });
  L('nj', 'lunge-slow', 'Walking lunges, slow', 'Tall chest, soft knee.', { dose: '2 x 6 each' });

  /* strength, 10 and up */
  L('squat', 'squat', 'Bodyweight squat, sit back', 'Push the floor away.', { dose: 'str' });
  L('squat', 'split', 'Split squat', 'Back knee kisses the floor.', { dose: 'str', each: 1 });
  L('squat', 'stepup', 'Step-up onto the box', 'Push the box into the ground.', { dose: 'str', each: 1, gear: 'box' });
  L('squat', 'lat-lunge', 'Lateral lunge', 'Sit back into the side you step to.', { dose: 'str', each: 1 });
  L('squat', 'rev-lunge', 'Reverse lunge', 'Step back soft, drive the front foot.', { dose: 'str', each: 1 });
  L('squat', 'cossack', 'Cossack squat, side to side', 'Slide low, heel stays down.', { dose: 'str', each: 1, min: 'train' });
  L('squat', 'wb-squat', 'Water bag front squat, hug it', 'Keep the water still.', { dose: 'str', gear: 'waterbag', back: 1 });
  L('squat', 'goblet', 'Goblet squat, light dumbbell', 'Push the floor away.', { dose: 'str', gear: 'db', load: 1 });
  L('push', 'pushup', 'Push-up (hands on a step if needed)', 'Body like a plank.', { dose: 'str' });
  L('push', 'hr-pushup', 'Hand-release push-up', 'Push the floor away fast.', { dose: 'str' });
  L('push', 'slow-pushup', 'Slow push-up: three seconds down', 'Lower like an elevator.', { dose: 'str' });
  L('push', 'tap-pushup', 'Push-up to a shoulder tap', 'Hips stay still as a table.', { dose: 'str', back: 1 });
  L('push', 'pike-pushup', 'Pike push-up', 'Head goes between your hands.', { dose: 'str', overhead: 1, min: 'train' });
  L('push', 'band-press', 'Band chest press', 'Punch the band forward.', { dose: 'str', gear: 'bands' });
  L('push', 'db-press', 'Half-kneeling one-arm dumbbell press', 'Push the ceiling away.', { dose: 'str', each: 1, gear: 'db', load: 1, overhead: 1 });
  L('pull', 'tablerow', 'Table row (under a sturdy table)', 'Pull the table to you.', { dose: 'str' });
  L('pull', 'invrow', 'Inverted row under the bar', 'Pull the bar to your chest.', { dose: 'str', gear: 'bar' });
  L('pull', 'bandrow', 'Band row', 'Pull the band to your pockets.', { dose: 'str', gear: 'bands' });
  L('pull', 'pullapart', 'Band pull-apart', 'Stretch the band across the room.', { dose: 'str', gear: 'bands' });
  L('pull', 'superman-pull', 'Superman pulls: face down, elbows to pockets', 'Pull your elbows into your back pockets.', { dose: 'str' });
  L('pull', 'ytw', 'Floor Y-T-W raises, face down', 'Thumbs to the ceiling.', { dose: '2 x 5 each letter', overhead: 1 });
  L('pull', 'hang', 'Dead hang from the bar', 'Squeeze the bar like a lemon.', { dose: 'hold', gear: 'bar', overhead: 1 });
  L('pull', 'db-row', 'One-arm dumbbell row', 'Pull the weight to your pocket.', { dose: 'str', each: 1, gear: 'db', load: 1 });
  L('hinge', 'airplane', 'Single-leg airplane (hip hinge)', 'Reach your heel to the wall behind you.', { dose: '2 x 6 each' });
  L('hinge', 'bridge', 'Glute bridge', 'Push the floor away with your heels.', { dose: 'str' });
  L('hinge', 'sl-bridge', 'Single-leg glute bridge', 'Hips stay level like a table.', { dose: 'str', each: 1, min: 'learn' });
  L('hinge', 'rdl-reach', 'Single-leg reach to a cone (RDL reach)', 'Reach long, back leg to the wall.', { dose: '2 x 6 each' });
  L('hinge', 'walkout', 'Hamstring walkouts from a bridge', 'Tiny heel steps out and back.', { dose: '2 x 5' });
  L('hinge', 'bandgm', 'Band good morning', 'Push your hips to the wall behind you.', { dose: 'str', gear: 'bands', back: 1 });
  L('hinge', 'nordic', 'Nordic lower, partner holds the feet', 'Fall as slowly as you can.', { dose: '2 x 3', min: 'train' });
  L('hinge', 'db-rdl', 'Dumbbell Romanian deadlift, light', 'Slide the weight down your legs.', { dose: 'str', gear: 'db', load: 1, back: 1 });
  L('core', 'plank', 'Plank', 'Still as a table.', { dose: 'hold', back: 1 });
  L('core', 'sideplank', 'Side plank', 'Hips to the ceiling.', { dose: 'hold', each: 1, back: 1 });
  L('core', 'deadbug', 'Dead bug, slow', 'Press your back into the floor.', { dose: '2 x 8 each' });
  L('core', 'birddog', 'Bird dog', 'Do not spill the water on your back.', { dose: '2 x 6 each' });
  L('core', 'pallof', 'Pallof press (band)', 'Do not let the band turn you.', { dose: '2 x 8 each', gear: 'bands', back: 1 });
  L('core', 'bearhold', 'Bear hold, knees an inch off the floor', 'Hover like a table.', { dose: 'hold' });
  L('core', 'hollow', 'Hollow hold', 'Be a banana.', { dose: 'hold', min: 'learn', back: 1 });
  L('core', 'copen', 'Short Copenhagen side plank, knee on the bench', 'Squeeze the bench.', { dose: '2 x 15 sec each', gear: 'box', min: 'train', back: 1 });
  L('core', 'taps', 'Plank shoulder taps', 'Hips stay still.', { dose: '2 x 8 each', back: 1 });
  L('carry', 'bearhug', 'Bear-hug carry (anything heavy-ish)', 'Hug it tight, walk tall.', { dose: 'trip', back: 1 });
  L('carry', 'jugs', 'Farmer carry with two water jugs', 'Walk tall like a soldier.', { dose: 'trip', back: 1 });
  L('carry', 'wb-carry', 'Water bag bear-hug carry', 'Keep the water quiet.', { dose: 'trip', gear: 'waterbag', back: 1 });
  L('carry', 'suitcase', 'Suitcase carry, one dumbbell', 'Stay tall. Do not lean.', { dose: 'trip', gear: 'db', load: 1, back: 1 });
  L('carry', 'bear-crawl', 'Bear crawl 10 yards and back', 'Knees low, back flat as a table.', { dose: '2 trips' });

  /* strength as a game, 6 to 9 */
  L('f-sq', 'statue', 'Squat and freeze like a statue', 'Sit on an invisible chair.', { dose: '2 x 8' });
  L('f-sq', 'frog', 'Frog jumps, then freeze', 'Land like a quiet frog.', { dose: '2 x 5', jump: 1 });
  L('f-sq', 'wallsit', 'Wall sit contest', 'Sit on the invisible chair.', { dose: '2 x 20 sec' });
  L('f-push', 'hi5', 'Push-up high fives (knees are fine)', 'Body like a board.', { dose: '2 x 6' });
  L('f-push', 'crab-race', 'Crab walk race', 'Belly to the sky.', { dose: '3 trips' });
  L('f-push', 'wheelbarrow', 'Wheelbarrow walk with a partner', 'Strong like a table.', { dose: '2 trips' });
  L('f-crawl', 'crawl', 'Bear crawl there, crab walk back', 'Low and slow.', { dose: '3 trips' });
  L('f-crawl', 'army', 'Army crawl under a table or rope', 'Stay under the laser.', { dose: '3 trips' });
  L('f-crawl', 'crawl-tag', 'Bear crawl tag', 'Crawl fast, stay low.', { dose: '2 min' });
  L('f-core', 'plankgame', 'Plank hold game: who moves first?', 'Still as a table.', { dose: '2 x 20 sec' });
  L('f-core', 'superman', 'Superman hold contest', 'Fly like Superman.', { dose: '2 x 15 sec' });
  L('f-core', 'beetle', 'Dead bug, slow, like a flipped beetle', 'Back glued to the floor.', { dose: '2 x 6 each' });
  L('f-carry', 'carry-fun', 'Carry something heavy to the line and back', 'Hug it tight, walk tall.', { dose: '2 trips' });
  L('f-carry', 'pillow', 'Pillow carry relay', 'Fast feet, tight hug.', { dose: '2 trips' });
  L('f-carry', 'jug-fun', 'Water jug carry, one in each hand', 'Walk tall like a soldier.', { dose: '2 trips' });

  /* play */
  L('play', 'play-sport', 'Free play: another sport, bike, pickup anything', 'You pick the game.', { dose: 'most of the time' });
  L('play', 'play-derby', 'Wiffle ball home run derby', 'Pick your spot, then swing.', { dose: 'most of the time' });
  L('play', 'play-tag', 'Tag games: everybody is it', 'Dodge, cut, go.', { dose: 'most of the time' });
  L('play', 'play-relay', 'Sprint relays with friends or family', 'Race the clock, then each other.', { dose: 'most of the time' });
  L('play', 'play-pickle', 'Pickle (rundown) game in the yard', 'Fake, freeze, go.', { dose: 'most of the time', overhead: 1 });
  L('f-play', 'f-pick', 'Pick one: tag, a relay, or an obstacle course', 'You pick.', { dose: 'until time is up' });
  L('f-play', 'f-obstacle', 'Obstacle course: build it together', 'Under, over, around.', { dose: 'until time is up' });
  L('f-play', 'f-catch', 'Throw and catch with a different ball every round', 'Eyes on the ball.', { dose: 'until time is up', overhead: 1 });
  L('f-play', 'f-hide', 'Hide and seek, sprint home', 'Fastest feet home.', { dose: 'until time is up' });
  L('mobil', 'mob-hip', 'Hip flow and mobility', 'Slow and smooth.', { dose: '1 round' });
  L('mobil', 'mob-couch', 'Couch stretch and hip openers', 'Breathe out long.', { dose: '1 round' });
  L('mobil', 'mob-ankle', 'Ankle and hip mobility circuit', 'Knee past the toes, heel down.', { dose: '1 round' });
  L('rope-easy', 'rope-easy', 'Easy jump rope', 'Tiny bounces.', { dose: '3 x 30 sec', gear: 'rope', jump: 1, spurtOK: 1 });

  var LIB_BY = {}; LIB.forEach(function (m) { LIB_BY[m.id] = m; });
  var DEMO_PRIORITY = {};

  function has(g, id) { return g.indexOf(id) >= 0; }
  function okMove(m, g, f, stage) {
    if (m.min && !stageAtLeast(stage, m.min)) return false;
    if (m.gear && !has(g, m.gear)) return false;
    if (m.load && !f.loadOK) return false;
    if (m.jump && f.noJump) return false;
    if (m.jump && f.spurt && !m.spurtOK && /^(hop|stick|lat2|speed|land|lat|f-hop|f-sq|f-animal)$/.test(m.slot)) return false;
    if (m.overhead && f.noOverhead) return false;
    if (m.back && f.noBack) return false;
    return true;
  }
  /* rot = block number + session index: A, B and C differ, and each new block shifts every slot to a new variation. */
  function pick(slot, g, f, stage, rot, avoid) {
    var c = LIB.filter(function (m) { return m.slot === slot && okMove(m, g, f, stage) && (!avoid || avoid.indexOf(m.id) < 0); });
    if (!c.length) return null;
    /* gear you own gets a turn first: owned-gear moves sort ahead of bodyweight ones */
    c.sort(function (a, b) { return (b.gear ? 1 : 0) - (a.gear ? 1 : 0); });
    return c[((rot % c.length) + c.length) % c.length];
  }
  function doseFor(m, stage, f, wk, tier) {
    var d = m.dose;
    if (d === 'str') {
      var sr = STRENGTH[stage][Math.min(tier, DEFAULTS.maxTier)], w = wave(sr[0], sr[1], wk);
      if (m.each) w[1] = Math.max(5, Math.floor((w[1] - 2) / 2) * 2);
      return doseText(w, m.each);
    }
    if (d === 'pow') { var p = POWER[stage], s = f.spurt ? Math.max(1, p[0] - 1) : p[0]; return doseText(wave(s, p[1], wk, true)); }
    if (d === 'hop') { var hp = POWER[stage]; return doseText(wave(f.spurt ? Math.max(1, hp[0] - 1) : hp[0], f.spurt ? 6 : 10, wk, true)); }
    if (d === 'hold') {
      var base = { fun: 15, learn: 20, train: 25, compete: 30 }[stage] + 5 * Math.min(tier, DEFAULTS.maxTier) + (wk === 3 ? 5 : 0);
      return (wk === 4 ? 1 : 2) + ' x ' + base + ' sec' + (m.each ? ' each' : '');
    }
    if (d === 'trip') return wk === 4 ? '2 trips' : '2-3 trips';
    return d;
  }
  function item(m, stage, f, wk, tier) { return { id: m.id, name: m.name, dose: doseFor(m, stage, f, wk, tier), cue: m.cue, demo: 'assets/moves/' + m.id + '.mp4' }; }
  function fill(slots, g, f, stage, wk, tier, rot) {
    var out = [], used = [];
    slots.forEach(function (s, k) {
      var m = null;
      for (var i = 0; i < s.length && !m; i++) m = pick(s[i], g, f, stage, rot + k, used);
      if (m) { used.push(m.id); out.push(item(m, stage, f, wk, tier)); }
    });
    return out;
  }

  function warmBlock(stage, g, f, wk, tier, rot) {
    if (stage === 'fun') return fill([['f-animal'], ['f-game'], ['f-hop']], g, f, stage, wk, tier, rot);
    return fill([['prep'], ['land'], ['bal'], ['lat']], g, f, stage, wk, tier, rot);
  }
  function moveBlock(stage, g, f, wk, tier, rot, long) {
    if (f.noJump) return fill([['nj'], ['nj'], ['nj'], ['react']], g, f, stage, wk, tier, rot);
    var sl = f.spurt ? [['hop-s', 'hop'], ['stick-s'], ['lat-s'], ['react']] : [['hop'], ['stick'], ['lat2'], ['react']];
    if (long) sl.push(['speed']);
    return fill(sl, g, f, stage, wk, tier, rot);
  }
  function strengthBlock(stage, g, f, wk, tier, rot, short) {
    if (stage === 'fun') return fill(short ? [['f-sq'], ['f-push'], ['f-crawl']] : [['f-sq'], ['f-push'], ['f-crawl'], ['f-core'], ['f-carry']], g, f, stage, wk, tier, rot);
    return fill(short ? [['squat'], ['push'], ['pull'], ['core']] : [['squat'], ['push'], ['pull'], ['hinge'], ['core'], ['carry']], g, f, stage, wk, tier, rot);
  }
  function playBlock(stage, g, f, wk, tier, rot) {
    if (stage === 'fun') return fill([['f-play'], ['f-play']], g, f, stage, wk, tier, rot);
    return fill([['play'], ['rope-easy'], ['mobil']], g, f, stage, wk, tier, rot);
  }

  /* ---------- test day (opens every 4-week block) ----------
     Six quick tests, about 10 minutes. Each kid compares only to their own last number. No norms, no rankings. */
  var TESTS = [
    { id: 'broad', name: 'Standing broad jump', unit: 'in', better: 'up', how: 'Toes behind a line. Jump forward as far as you can and stick the landing. Measure from the line to the back of the closest heel. Best of 3.', cue: 'Jump out, land like a statue.', jump: 1, src: ['alphafit'] },
    { id: 'pogo20', name: 'Pogo hops in 20 seconds', unit: 'hops', better: 'up', how: 'Two feet, small fast bounces in place. Partner counts every landing for 20 seconds. One try.', cue: 'Bounce like the floor is hot.', jump: 1, spurtOK: 1, src: ['vanhooren2016', 'ours'] },
    { id: 'sprint10', name: '10-yard sprint', unit: 'sec', better: 'down', dec: 2, how: 'Partner starts a phone stopwatch on your first move and stops it when your chest crosses 10 yards. Best of 2. No partner? Skip it.', cue: 'Fastest first step wins.', jump: 1, min: 'learn', src: ['ours'] },
    { id: 'push30', name: 'Push-ups in 30 seconds', unit: 'reps', better: 'up', how: 'Good reps only: body like a plank, chest down to a fist on the floor. Knees are fine for 6 to 9. Count in 30 seconds.', cue: 'Push the floor away.', overhead: 1, src: ['fitnessgram'] },
    { id: 'plank', name: 'Plank hold', unit: 'sec', better: 'up', cap: 120, how: 'Elbows under shoulders, body straight. Stop when the hips sag or lift. Cap at 2 minutes.', cue: 'Still as a table.', back: 1, src: ['ours'] },
    { id: 'balance', name: 'Single-leg balance', unit: 'sec', better: 'up', cap: 60, how: 'Hands on hips, one foot up. Count until the foot touches down or the hands come off. Do both legs and enter the shorter time. 10 and up: eyes closed. 6 to 9: eyes open. Cap at 60.', cue: 'Grow tall through the top of your head.', src: ['ours'] }
  ];
  function testsFor(p) {
    var f = flagsFor(p), stage = f.stage;
    return TESTS.map(function (t) {
      var skip = null;
      if (t.min && !stageAtLeast(stage, t.min)) skip = 'Starts at age 10.';
      else if (t.jump && f.noJump) skip = 'Skipped: knee or heel discomfort reported.';
      else if (t.jump && f.spurt && !t.spurtOK) skip = 'Skipped during a reported growth spurt. Back next block.';
      else if (t.overhead && f.noOverhead) skip = 'Skipped: arm or shoulder discomfort reported.';
      else if (t.back && f.noBack) skip = 'Skipped: back discomfort reported.';
      var o = {}; for (var k in t) o[k] = t[k]; o.skip = skip; o.demo = 'assets/moves/test-' + t.id + '.mp4'; return o;
    });
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
    W.push(why('rotate'));
    W.push(why('tests'));
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
        var rot = ((st.blockNo || 1) - 1) + i;
        var items = b === 'warm' ? warmBlock(stage, g, f, wk, tier, rot) : b === 'move' ? moveBlock(stage, g, f, wk, tier, rot, minutes >= 30) : b === 'strength' ? strengthBlock(stage, g, f, wk, tier, rot, short) : playBlock(stage, g, f, wk, tier, rot);
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

  return { LIB: LIB, TESTS: TESTS, testsFor: testsFor, SOURCES: SOURCES, STAGES: STAGES, GEAR: GEAR, OPTIONS: OPTIONS, RULES: RULES, WEEKS: WEEKS, DEFAULTS: DEFAULTS,
    stageOf: stageOf, gearAllowed: gearAllowed, label: label, buildPlan: buildPlan, reviewWeek: reviewWeek, summarizeEntries: summarizeEntries, why: why };
})();
