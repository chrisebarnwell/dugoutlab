// ── DUGOUTLAB: REAL SITUATIONS DATA ───────────────────────────────
// To add a scenario: copy one object, change the fields, append to the
// array. id must be unique and URL-safe (lowercase, hyphens). The list
// page and detail page read from this file automatically.

var SCENARIOS = [
  {
    id: "big-game-hard-thrower",
    title: "The big game against the kid who throws hard",
    // Short label shown on the card
    category: "Game Day · Pressure",
    ageRange: "7U–10U",
    // One-line hook for the card
    hook: "Your team went cold in the championship. Scared, late, balls hit right at them. Here's how to coach the night and the next at-bat.",
    // Tags for future filtering
    tags: ["fear", "timing", "pressure", "hitting", "playoffs"],

    // The scenario as it really happens
    scenario:
      "Championship game. The other team rolls in a little hotter and runs out an oversized pitcher who throws noticeably harder than anything your kids have seen. Your team goes cold and loses big, putting up zero runs across the innings he's in. From the stands the kids look nervous. When they do make contact, they're late, and the ball gets hit right at fielders who are making plays. It feels like the wheels came off.",

    // TL;DR: the whole approach in a few lines
    tldr: [
      "Two problems, not one: fear of the hard stuff, and timing that went late. Fix timing and the fear often shrinks with it.",
      "Do not tell them \"the ball just found us.\" That's a luck message, and this wasn't luck. They were late and jumpy. Name it honestly, briefly, then move.",
      "Live BP near game speed, short and crisp, helmets on. Get them on time and aggressive, then stop while they feel good.",
      "Give every hitter a close-in job (barrel to the ball, hard up the middle). A kid with a job is a driver, not a passenger.",
      "Win the night by effort and attitude and loose, on-time swings, not the scoreboard. Loose and on time is also your best shot at the scoreboard."
    ],

    // The coach's real role in this moment
    coachRole:
      "Your job here is not to manufacture a pep-talk win or pretend the pitcher wasn't intimidating. Kids read fake. Your job is to tell the truth in a small, calm way, then hand them something concrete to do about it. In our experience fear grows when things are vague and shrinks when a kid has a clear, doable job and feels on time. You are the thermostat, not the thermometer. If you are loose and matter-of-fact about the hard thrower, they borrow that from you. If you are tight and over-coaching, they borrow that instead.",

    // Solution options: different paths a coach can take
    solutions: [
      {
        label: "Fix timing first (start here)",
        body:
          "Most \"scared and late\" is just late. A hitter who is on time feels more in control, and that usually takes the edge off the fear. Run live BP focused on rhythm and being early: get the load and the hands started before the ball leaves the hand. Cue early, not mechanics. Do not rebuild swings the night before a game."
      },
      {
        label: "Bring the velocity to them on purpose",
        body:
          "You cannot cure fear of hard stuff with soft lobs. Manufacture game-speed reps safely: helmets on, thrower behind an L-screen, and move in a few feet so the ball gets there faster, or turn a pitching machine up a notch. Enough reps that the speed stops being a surprise. Familiar speed feels less scary."
      },
      {
        label: "Give intent, keep the target close",
        body:
          "Scared kids are passengers. Hand each hitter a job they can own. For this age keep it close-in and external: barrel to the ball, hit it hard back up the middle, beat the ball to the spot. The job gives their mind something to do besides worry. (See the hitting-intent article.)"
      },
      {
        label: "Reset the standard to effort and attitude",
        body:
          "Tonight a good aggressive swing on time is the win, not a hit. A confident rip that lines out earned it. Praise the swing, not the result. A team that measures itself by runs against a hot pitcher tends to press. A team that measures itself by quality at-bats keeps swinging."
      }
    ],

    // Concrete drills
    drills: [
      {
        name: "Early-load short flip",
        detail:
          "Behind an L-screen, flip from ~15 feet at a brisk pace. One cue only: \"be early.\" The hitter must have hands loaded and back foot set before the ball is released. 8–10 swings, then rotate. Goal is rhythm and being on time, not perfect mechanics."
      },
      {
        name: "Machine step-up",
        detail:
          "Helmets on. Set a machine close to tonight's pitcher, a notch faster only if kids are handling it. Start with takes to time it up, then swing. The point is to make real velocity familiar so the live arm feels manageable."
      },
      {
        name: "Call-your-job BP",
        detail:
          "Before each swing the hitter says their job out loud: \"barrel to the ball,\" \"hard up the middle.\" The declaration is the rep. You are training the habit of stepping in with a plan instead of hoping."
      },
      {
        name: "Two-strike battle reps",
        detail:
          "End each round with a couple of two-strike swings where the only goal is a hard, on-time foul or fair ball. Teaches them that battling a tough pitcher is a win in itself, which can take some of the fear out of it."
      }
    ],

    // What to say / what not to say / how much
    talkingPoints: {
      say: [
        "\"That kid threw hard. Being a little jumpy against that is normal. Tonight we get our timing back.\"",
        "\"Your only job this at-bat is to be on time and put the barrel on it.\"",
        "\"I want to see a confident swing. If you line out on a good rip, I'm thrilled.\"",
        "\"We're not chasing the scoreboard. We're chasing good swings.\""
      ],
      dontSay: [
        "\"The ball just found them, that's baseball.\" (This was timing and nerves, not luck. Kids know the difference and it teaches them to explain away effort.)",
        "\"Don't be scared / relax / just calm down.\" (Telling a kid not to feel something rarely works, and it gives them nothing to do.)",
        "\"You have to win this.\" (Adds pressure to the exact thing that caused the freeze.)",
        "A mechanics lecture. (\"Squash the bug, elbow up, load your hips.\" A pile of body-part cues on a big night tends to make kids tighter, not looser.)"
      ],
      howMuch:
        "Less than you think. One calm sentence naming the hard thrower, one clear job per hitter, and steady body language. Say it once, then let them play. Over-talking on a big night is an easy way to hand your own nerves to the kids."
    },

    // The DugoutLab through-line
    bottomLine:
      "It's the championship and they're little. The most important outcome is that they walk off still loving this. A team that plays loose, swings on time, and loses had a better night than a team that wins tight and scared. Your one job, tonight of all nights, is to get them to want to come back tomorrow.",

    // Related content links (optional)
    related: [
      { label: "What Is Your Intent? (hitting article)", href: "articles/intent-in-hitting.html" },
      { label: "Why Kids Quit", href: "articles/why-kids-quit.html" },
      { label: "Your One Job as a Youth Coach", href: "articles/one-job.html" }
    ]
  }
];
