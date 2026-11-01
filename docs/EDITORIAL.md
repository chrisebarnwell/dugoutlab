# DugoutLab editorial standard

Every Field Notes article, and every long-form page in `TLDR_PAGES` in
`.github/scripts/check_site.py`, opens with a TL;DR. The site check fails the
build without one, so this is a requirement for publishing, not a style tip.

## Voice

An experienced coach explaining something useful to another coach at the field.
Warm, direct, and practical. Not an academic journal, not a marketing agency.

House rules the site check enforces everywhere: no em dashes, no emoji, no
"always free" promises.

## The TL;DR component

Place it as the first element inside `<div class="article-body">`, directly
after the title and read time in the page hero.

```html
<aside class="tldr" aria-labelledby="tldr-h">
  <h2 class="tldr-h" id="tldr-h">TL;DR <span>The short version</span></h2>
  <ul>
    <li><b>The idea:</b> What the article is actually saying, in one or two sentences.</li>
    <li><b>Why it matters:</b> Why a coach or parent should care.</li>
    <li><b>Try this:</b> One thing to do at the next practice or game.</li>
  </ul>
</aside>
```

Rules:

1. Two to four bullets, usually three. The check counts them.
2. Readable in 15 to 30 seconds. Aim for 60 to 110 words in total.
3. Summarize the article's real conclusion. Read the whole piece first. Never
   write it from the title.
4. Include at least one concrete action where the piece supports one.
5. Plain language. If you need a term like "constraints-led", explain it in the
   same sentence.
6. Never make a finding sound stronger than the article does. For research
   pieces, keep the hedge ("small studies", "early evidence", "our inference")
   and use a label like **What the research shows:** or **The limits:** when
   that is the honest summary.
7. The labels may change to fit the piece (for example **The story:** for a
   personal essay). Keep each label bold and short, followed by a colon.
8. No new claims, numbers, or sources that are not in the article body.

Short announcements, tool pages, FAQs, and stubs do not need one. To opt a
long page out on purpose, put `data-no-tldr` on its `<body>` and say why in a
comment.

## Try This With Your Kid

For articles a parent can act on at home, add the shared component near the
end of the article (before "Guidelines and sources"):

```html
<aside class="try-kid" aria-label="Try this with your kid">
  <div class="try-kid-h">Try this with your kid</div>
  <p>Two or three sentences a parent can do in the backyard or on the car ride home.</p>
  <div class="try-kid-meta">10 min &middot; what you need</div>
</aside>
```

Keep it to one activity, five to fifteen minutes, with no special equipment
beyond what the article already mentions.

## Before you publish a new article

1. Copy an existing article in `articles/` as the template. Run
   `python3 .github/scripts/check_site.py --fix` to stamp the shared nav,
   footer, and head tags (canonical URL, social card, icons).
2. Write the TL;DR last, after the article is final, and have a second person
   read it against the body.
3. If a TL;DR was drafted by a tool or an assistant, treat it as a draft. Check
   every bullet against the article before publishing.
4. Add the article to `articles.html` (the check fails if you forget) and to
   `sitemap.xml`.
5. Run `python3 .github/scripts/check_site.py` until it prints CLEAN.
