# GameDay Helpers: Ship-Today Audit (paste into Claude Code)

Final professional-grade audit on GameDay Helpers before it goes public TODAY.

Repo: github.com/Chriseb13/gamedayhelpers
Stack: static HTML on GitHub Pages (Jekyll default, CNAME = gamedayhelpers.com), Google Apps Script backend, Google Sheets as the database.

Assume nothing works until you have verified it yourself. Do not trust any existing audit, report, or setup file in the repo as proof of anything. Re-verify from scratch.

## HARD RULES
- Work on a branch called `ship-audit`. Do not push to main. Do not merge.
- NEVER create a new Apps Script deployment. Only ever a NEW VERSION of the existing one.
- Do not POST to the live backend unless I approve it. If I do, prefix every value with `TEST_`.
- Do not touch `CNAME`. Do not change the Apps Script `/exec` URL in any HTML file.
- Do not rename or remove any form input `id`, `name`, or `value`. The backend keys depend on them. If a fix truly requires it, change the matching key in `apps-script-code.gs` in the same commit and list every such change in the report.
- Never commit a real phone number. `OWNER_CELL` in the .gs stays `""` in the repo; I set it in the Apps Script editor only.
- Ask me before anything irreversible or anything touching live data.
- No em dashes anywhere, in code, comments, or copy.
- Report in short bullets and tables. Lead with the verdict. No narration of what you tried.

## CURRENT MODEL (this overrides anything in the repo that contradicts it)
- Coaches join free. Helpers join free. No fee to anyone during the Tampa beta.
- The coach pays the helper directly after the game, app to app (Venmo, Cash App, PayPal, Zelle). No cash. GameDay Helpers never touches game money and never processes payments.
- Pay anchor: $30+ typical for a two hour game. Floor is $20 first hour, $15 each additional.
- A real person matches every game by hand. No algorithm, no instant matching, no guarantees.
- Helpers must be 14+. Under 18 requires a parent or guardian approval email before they can be matched.
- Founding badge: first 50 helpers and first 50 coaches get a permanent number.
- Brand: cobalt #1747C8 actions, navy #102A43 dark surfaces, lime #D7F75B accent, light #F7F9FC. Fonts Barlow Condensed 700 + Inter.
- Verified stats only: 9,000+ youth games a year in Tampa Bay, 8 leagues, roughly 310 to 400 teams. Nothing else.

## PHASE 0: Ground truth
0. **Confirm the launch package is present before anything else.** All three must be true:
   - `apps-script-code.gs` contains `handleGameRequest`, `handleConsent`, `LockService`, and `SITE_BASE_URL = "https://gamedayhelpers.com"`.
   - `styles.css` uses `#1747C8` as the primary action color, not `#f97316`.
   - `index.html` does not contain the words "vetted" or "never take a cut".
   If any is false, STOP and tell me: "Launch package not in repo. Copy the gdh-launch folder contents into the repo and re-run." Do not audit the old files. If the files are present but uncommitted, make them the first commit on `ship-audit`.
1. Read every file in the repo. List them with last-modified dates.
2. Find the Apps Script `/exec` URL the HTML forms POST to. Confirm every form uses the SAME url. List any that differ.
3. Cross-check `apps-script-code.gs` against what the forms send: every field name posted, and whether the backend reads and stores it.
4. One table: page | form | POST type | fields sent | fields actually saved | mismatch Y/N.

## PHASE 1: Hidden breakage hunt (highest value)
Find what fails silently.
1. **Silent failures.** The forms use `no-cors` fetch, so the browser shows success even when the backend errors. List every path where a user sees success but nothing was saved. Then PROPOSE the fix (switch to `mode:'cors'` with `Content-Type: text/plain` so the JSON `result` can be read and a real error shown). Do not apply it without my approval; if it breaks, nothing submits.
2. **Field name drift.** Any input `id`, `name`, or `value` the JS reads but that does not exist in the markup, or that the backend expects under a different key.
3. **Broken links.** Every `href` and `src` across all pages. Confirm each referenced file exists in the repo. Confirm every anchor target exists. Check external links resolve.
4. **Email link tracing.** Every URL the .gs builds inside an email (profile link, consent link, request-game link, review link, terms link). Confirm the target page exists and reads the exact same query parameter names the .gs writes (`review.html` reads `g`, `rev`, `revname`, `role`, `by`; `doGet` reads `p` and `consent`).
5. **Orphan pages.** Any HTML file not linked from anywhere. Any nav link pointing to a page that does not exist.
6. **Dead JS.** Functions defined but never called, called but never defined, or referencing element ids not in the markup.
7. **Offer calculator in request-game.html.** Test all 45 combinations (3 first-hour rates x 3 additional rates x 5 lengths). Verify half hours charge half the additional rate, the displayed total is correct, the default is 2 hr / $35, and the value actually submitted matches the display. Table any mismatch.
8. **Duplicate and concurrent submits.** What happens on a double-tap of submit? On two simultaneous submissions? Is the LockService wrapping the whole `doPost`? Is the Founding number computed inside that lock, or can two people both get #17? Does a duplicate email create a second row?
9. **Minor consent chain.** Trace the whole path in code: minor signs up, parent email fires, parent taps approve, ConsentStatus flips, the token burns, reuse is blocked, and matching is blocked until approved. Confirm every link exists. This is the highest liability path in the business.
10. **Privacy leak check.** Confirm no public GET endpoint and no rendered profile page can return a helper's age, email, phone, payment handle, parent name, or parent email. Check the raw HTML output of `renderProfile`, not just what is visible.

## PHASE 2: Professional polish
1. **Meta and SEO.** Every page needs a unique `<title>`, unique meta description, canonical URL, `og:title`, `og:description`, `og:image` (absolute URL on gamedayhelpers.com), `twitter:card`. List what is missing per page. Build an on-brand `og.png` (1200x630) if none exists and wire it in.
2. **Favicons.** Confirm every referenced favicon exists and matches the current brand colors.
3. **404 page.** GitHub Pages serves `404.html`. If missing, build one on brand with links to Home, For Coaches, For Helpers.
4. **robots.txt and sitemap.xml.** Create both if missing. Sitemap lists only the public pages.
5. **Internal files must not be public pages.** GitHub Pages serves everything in the repo. Move `PRELAUNCH.md`, `OPERATIONS-MAP.html`, `SETUP-STEPS.md`, `gdh-logo-light.png`, and the two files you will write (`SHIP-REPORT.md`, `RUNBOOK.md`) into `/internal/`, and add `_config.yml` with `exclude: [internal]`. Confirm nothing left at the root is internal. Then rewrite `SETUP-STEPS.md`: its Step 3 says "Deploy > New deployment", which is exactly the mistake that breaks this site. Replace with the edit-existing-deployment sequence.
6. **Mobile at 390px.** Every page: no horizontal scroll, every tap target 44px+, forms usable one handed, no text under 14px, nothing overlapping.
7. **Accessibility.** Every input has a matching `<label for>`. Every image has alt text. Visible focus on every interactive element. Body text contrast 4.5:1 or better. Keyboard-only navigation works through every form.
8. **Form UX.** On every form: does submit disable while sending? Is there a visible loading state? Does success say what happens next? Does a validation error say what to fix? Fix any that fail.
9. **Consistency sweep.** Identical everywhere: the name "GameDay Helpers", the tagline, the pay anchor, the beta-is-free statement, the footer, the nav, the contact email, the year.

## PHASE 3: Trust and legal
1. Grep every page AND every email string in the .gs for claims the business cannot back: guaranteed coverage, screening or background check claims, promised response times, review counts, testimonials, partner or league names, press mentions, or any statistic beyond the three verified ones above. Flag every hit with a written replacement line.
2. Read terms.html and any privacy language. Flag anything that promises what the backend does not do, especially around data sharing, payment handling, and minors. Do not write legal language. Tell me what to ask the attorney.
3. Confirm a real working contact route on every page, with the same email address everywhere, and that the repo contains no real person's phone number or payment handle anywhere.
4. Confirm the site never implies GameDay Helpers holds or processes game payments.

## PHASE 4: Operator readiness
The business has exactly one manual step: matching a coach's request to a helper. You cannot open the Sheet or send email from here, so verify these IN CODE and say so.
1. Trace the Sheet-side tooling: the `onOpen` custom menu, the match email function, the block on unapproved minors, the status update to MATCHED, the hourly review trigger installer, and the TEST_ cleanup. Confirm each exists and is wired.
2. Trace the owner alert emails: helper signup, coach signup, game request, consent approved, league inquiry, and backend error. Flag any missing.
3. Confirm a real backend error emails the owner with the payload, and that a plain validation failure (a bot posting garbage) does NOT.
4. Write `internal/RUNBOOK.md`: how to match a game, what to do on a helper no-show, what to do if a coach does not pay, how to read the Executions log to confirm which deployment version live traffic is hitting, and how to pull a list of unmatched OPEN games.

## PHASE 5: Deliverables
1. `internal/SHIP-REPORT.md`:
   - GO or NO-GO on the first line.
   - Launch blockers, ranked, each with file and line.
   - Fixed on this branch, listed.
   - Needs Chris: decisions, legal, deploy step.
   - Scorecard: Backend, Data integrity, Privacy, Copy, Design polish, Mobile, Accessibility, SEO, Operator readiness. Score 1 to 5 each with one line of why.
2. `internal/RUNBOOK.md` as above.
3. Deploy checklist inside the report, in exact order: merge the PR, confirm GitHub Pages rebuilt, paste the .gs into the Apps Script editor, set OWNER_CELL there, edit the EXISTING deployment to a new version, delete the Helpers, Coaches, and Games tabs so they rebuild with the new columns (export first if they hold real people), run `createReviewTrigger` once, run `smokeTest`, confirm three rows and three owner emails, delete TEST_ rows, submit the real helper form from a phone, then verify the Executions log shows live traffic hitting the new version.

Open a PR from `ship-audit` to main. Do not merge. Then give me GO or NO-GO in one line, the blocker count, and stop.
