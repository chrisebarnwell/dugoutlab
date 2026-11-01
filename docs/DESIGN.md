# DugoutLab design system

One idea: **a baseball field notebook inside a playful training lab.** Deep
forest green is the brand. Warm cream paper is where the work happens.

## Why two surfaces (and what is evidence vs. judgment)

The old site was dark forest green on every screen. It was recognizable, but
most of what coaches do here is read, fill in forms, and scan plans on a phone,
often outdoors.

What the research says (summarized by Nielsen Norman Group, "Dark Mode vs.
Light Mode: Which Is Better?", Raluca Budiu, 2020):

- For people with normal vision, dark text on a light background (positive
  polarity) produced better visual acuity and proofreading performance in
  several studies, and the advantage grew as text got smaller.
- In a glanceable-reading study (Dobres et al., 2017) polarity made no
  difference in simulated daytime; at night light mode was better and small
  text was much harder in dark mode.
- Some people with cloudy ocular media (for example cataracts) read faster
  in dark mode, and many people simply prefer it. NN/g recommends light mode as
  the default for general audiences, plus a dark option that follows the
  operating system setting.

What WCAG 2.2 requires: 4.5:1 contrast for normal text, 3:1 for large text
(24px, or about 18.5px bold), and touch targets of at least 24 by 24 CSS px
(we use 44px or more for anything a coach taps at the field).

What is our judgment, not a finding:

- That a lighter reading surface will make coaches return more often. No study
  shows dark interfaces hurt retention. We are measuring it (see Metrics).
- That outdoor sunlight favors light surfaces on today's phones. This is a
  reasonable inference from glare and polarity research, not something we
  tested at a field.

## The decision

| Surface | Used for | How |
| --- | --- | --- |
| **Field** (forest `#0F1F18`) | Nav, page heroes, footer, the phone bottom bar, the homepage hero and family band, and immersive game-like tools (Call Your Shot, Arena, Launch Lab, Skipper, Pitch Tracker, AR tools, Athlete Plan, Movement Library) plus chart-heavy pages (Framework, Stages, Season Plan) | Default. Nothing to add. |
| **Paper** (cream `#F7F3E9`) | Articles, the Learn hub, Practice in a Pinch, Lineup Builder, Pod Rotation, Game Day and Parents hubs, Training, Development, Stage Finder, Games Library, About, Privacy, By Age, Tools | `<body class="paper">` for a page, `.surface-paper` for a section |

**Paper follows the phone.** If the operating system is in dark mode, or the
reader picks Dark in the footer **Page style** switch (Auto, Light, Dark), paper
pages render on the field surface. Auto is the default. The choice is stored
in `localStorage` as `dl_theme` and applied before first paint by the shared
head block.

Inside a paper page, the nav, hero, footer and anything with `.on-dark` keep the
field tokens, so the brand band is always there.

## Tokens (css/main.css)

Every component reads tokens, so it works on both surfaces.

| Token | Field | Paper | Notes |
| --- | --- | --- | --- |
| `--bg` | `#0F1F18` | `#F7F3E9` | page background |
| `--ink` | `#f4efe6` | `#14241b` | 14.6:1 on paper |
| `--ink-soft` | 78% cream | `#3d4a41` | 8.4:1 on paper |
| `--ink-faint` | 60% cream | `#5a655d` | 5.5:1 on paper; raised from 40% on field to pass AA |
| `--gold` | `#C8862E` | `#8a5a12` | accent **text**; 5.3:1 on paper |
| `--forest2` / `3` / `-deep` | card / raised / well | `#FFFDF8` / `#F3EEE2` / `#ECE5D5` | surfaces |
| `--rule`, `--border` | cream at 14 to 18% | ink at 15 to 20% | lines |
| `--fill`, `--fill-hover`, `--on-fill` | `#C8862E`, `#d9973d`, `#0F1F18` | same | **fixed** button and chip fill, 5.6:1 |
| `--sage` | `#6F8F74` | same | "Try this with your kid" accent |

Rule: never use `--gold` as a background. Fills use `--fill` with `--on-fill`
text, so primary buttons look identical everywhere.

## Type

- Display: Playfair Display (600, italic accents in gold).
- Text and UI: Inter, 16px base (17px on phones), 1.6 to 1.72 line height,
  article measure about 68 characters (700px).
- Labels and data: JetBrains Mono, uppercase, wide tracking, small.

## Brand elements

- **The mark:** the gold slab D with a home-plate counter
  (`assets/brand/mark.svg`, `favicon.svg`, `apple-touch-icon.png`,
  `logo.svg` on forest, `logo-cream.svg` on cream, `mark-forest.svg` for
  one-color print).
- **Diamond geometry:** a rotated gold square marks steps, bullets, and the
  TL;DR. `field-lines.svg` puts faint base paths behind heroes.
- **Scorebook details:** ruled paper on the homepage practice card, mono
  numerals for minutes, the dashed "Try this" card.
- **Share image:** `assets/brand/og-default.png` (1200 by 630).

## Components

| Component | Class | Where |
| --- | --- | --- |
| TL;DR | `aside.tldr` | top of every article (see `docs/EDITORIAL.md`) |
| Try This With Your Kid | `aside.try-kid` | parent-actionable articles, Parents hub |
| Hub section / card | `.hub-sec`, `.hub-card`, `.hub-step` | Game Day, Parents |
| Quick list | `.qlist` | situations, related reads |
| First-use callout | `.lu-demo`, `.lu-sample-note` | Lineup Builder sample team |
| Age picker | `.age-pick` | By Age (values `a46 a79 a1012 a1315 a16`, stored as `dl_age`) |
| Toast | `DL.toast(msg)` | confirmations |
| Page style switch | `.theme-switch` | footer |

## Navigation

Primary nav is by task: **Practice | Game Day | Train | Learn**, plus
**Parents** set apart. On phones, the bottom bar carries Home, Practice, Game
Day, Train and Learn within thumb reach, and the menu adds All tools, By age
and About. The canonical nav and footer live in `.github/scripts/check_site.py`;
run it with `--fix` after adding a page.

## Metrics

Privacy-first daily counts (`DL.track(name)` posting to `/api/metric`; event
names are allowlisted in `functions/api/[[route]].js`). Nothing identifies a
person. Read them with D1:

```sql
SELECT day, name, SUM(n) FROM metrics GROUP BY day, name ORDER BY day DESC;
```

What to watch: practice built vs saved vs run vs reflected (the weekly loop),
`practice_reopened` and `return_visit` (are coaches coming back), `lineup_demo`
vs `lineup_built` (does the sample team lead to a real lineup), and the two
homepage buttons.
