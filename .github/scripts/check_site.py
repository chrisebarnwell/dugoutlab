#!/usr/bin/env python3
"""DugoutLab drift guard.

  python3 .github/scripts/check_site.py         check only, exit 1 on any drift
  python3 .github/scripts/check_site.py --fix   rewrite every standard footer, top nav and hamburger menu to the canonical one, then check

The AI note lives on about.html only. Anywhere else it fails the check.

Rules live here, in one place. Change the rule here, run --fix, commit.
"""
import glob, os, re, sys

FOOTER = '''<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <div class="logo">Dugout<span>Lab</span></div>
      <p>For the coach trying to get it right. Better practices. Kids who want to come back. Free tools and honest, evidence-checked coaching for volunteer coaches and parents.</p>
      <div class="theme-switch" role="group" aria-label="Page style">
        <span>Page style</span>
        <button type="button" data-theme-set="auto">Auto</button><button type="button" data-theme-set="light">Light</button><button type="button" data-theme-set="dark">Dark</button>
      </div>
    </div>
    <div class="footer-links">
      <h4>Practice</h4>
      <ul>
        <li><a href="{p}practice.html">Practice in a Pinch</a></li>
        <li><a href="{p}games.html">Games Library</a></li>
        <li><a href="{p}framework.html">Practice Framework</a></li>
        <li><a href="{p}progression.html">Season Plan</a></li>
      </ul>
    </div>
    <div class="footer-links">
      <h4>Game Day</h4>
      <ul>
        <li><a href="{p}lineup.html">Lineup Builder</a></li>
        <li><a href="{p}pods.html">Pod Rotation</a></li>
        <li><a href="{p}pitch-tracker.html">Pitch Tracker</a></li>
        <li><a href="{p}pocket-card.html">Back Pocket Card</a></li>
      </ul>
    </div>
    <div class="footer-links">
      <h4>Train and Learn</h4>
      <ul>
        <li><a href="{p}training.html">Train</a></li>
        <li><a href="{p}articles.html">Field Notes</a></li>
        <li><a href="{p}parents.html">For parents</a></li>
        <li><a href="{p}how-kids-learn.html">How kids learn</a></li>
      </ul>
    </div>
    <div class="footer-links">
      <h4>DugoutLab</h4>
      <ul>
        <li><a href="{p}tools.html">All tools</a></li>
        <li><a href="{p}ages.html">By age</a></li>
        <li><a href="{p}about.html">About</a></li>
        <li><a href="{p}privacy.html">Privacy</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>&copy; 2026 DugoutLab. Built for volunteer coaches.</span>
    <span>Your job is to make them want to come back tomorrow.</span>
  </div>
</footer>'''

# One menu, top nav and hamburger alike. (href, label). Organized by the coach's task.
NAV = [
    ('practice.html', 'Practice'),
    ('game-day.html', 'Game Day'),
    ('training.html', 'Train'),
    ('articles.html', 'Learn'),
    ('parents.html', 'Parents'),
]
# Hamburger only: the rest, one tap away on a phone
MOBILE_EXTRA = [
    ('tools.html', 'All tools'),
    ('ages.html', 'By age'),
    ('about.html', 'About'),
]
def nav_ul(p):
    return '<ul class="nav-links">\n' + ''.join(f'    <li><a href="{p}{h}"' + (' class="nav-aside"' if h == 'parents.html' else '') + f'>{t}</a></li>\n' for h, t in NAV) + '  </ul>'
def nav_mobile(p):
    return ('<div class="mobile-menu" id="mobile-menu">\n' + ''.join(f'  <a href="{p}{h}">{t}</a>\n' for h, t in NAV)
            + ''.join(f'  <a href="{p}{h}" class="mm-small">{t}</a>\n' for h, t in MOBILE_EXTRA) + '</div>')
NAV_RE = re.compile(r'<ul class="nav-links">.*?</ul>', re.S)
MOBILE_RE = re.compile(r'<div class="mobile-menu" id="mobile-menu">.*?</div>', re.S)

# Long-form editorial pages outside articles/ that also carry a TL;DR
TLDR_PAGES = ['how-kids-learn.html', 'coach-dad.html']

# Pages that are redirect stubs or special: no inbound link needed
NO_INBOUND_NEEDED = {'index.html', '404.html'}

# (label, regex) checked against every .html / .js / .css file
BANNED = [
    ('em dash',                 r'—|&mdash;|&#8212;|&#x2014;'),
    ('always-free promise',     r'(?i)free,\s*(always|forever)|always\s+free|free\s+forever|always\.\s*no paywall|always will be|made free'),
    ('GamedayHelpers mention',  r'(?i)gameday\s*helpers'),
    ('sponsor block',           r'(?i)footer-sponsor|sponsor-line|our sponsor|sponsored by'),
    ('internal notes',           r'(?i)notes for claude'),
    ('dead builder.html link',  r'href="(\.\./)?builder\.html"'),
    ('old tool name',           r'(?i)practice builder'),
    ('emoji',                   '[\U0001F000-\U0001FAFF]'),
    ('AI note outside about.html', r'(?i)footer-disclosure|\bAI[ -]assist'),
    ('old breadcrumb label "Articles"', r'class="breadcrumb"><a href="[^"]*articles\.html">[^<]*Articles<'),
    ('email gate on page load', r'email-gate\.js"[^>]*data-mode="page"'),
]
# rules that do not apply to specific files
EXEMPT = {'AI note outside about.html': {'about.html'}}
FOOTER_RE = re.compile(r'<footer class="footer">.*?</footer>', re.S)

# Shared <head> block: canonical URL, social cards, icons, the Page style switch, structured data.
# Generated from each page's own <title> and description, so a new page only needs those two.
SITE = 'https://dugoutlab.com'
HEAD_RE = re.compile(r'\n?<!-- dl:head -->.*?<!-- /dl:head -->', re.S)
def head_block(f, s):
    import html as H, json
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    d = re.search(r'<meta name="description" content="([^"]*)"', s)
    title = H.unescape(t.group(1).strip()) if t else 'DugoutLab'
    short = re.sub(r'\s*\|\s*DugoutLab\s*$', '', title)
    desc = H.unescape(d.group(1)) if d else ''
    path = '/' if f == 'index.html' else '/' + f[:-5]
    url = SITE + path
    art = f.startswith('articles/')
    esc = lambda x: H.escape(x, quote=True)
    out = ['<!-- dl:head -->',
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:type" content="{"article" if art else "website"}">',
        '<meta property="og:site_name" content="DugoutLab">',
        f'<meta property="og:title" content="{esc(short)}">',
        f'<meta property="og:description" content="{esc(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{SITE}/assets/brand/og-default.png">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="theme-color" content="#0F1F18">',
        '<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">',
        '<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">',
        '<link rel="icon" href="/assets/brand/icon-32.png" sizes="32x32" type="image/png">',
        '<link rel="manifest" href="/site.webmanifest">',
        '<script>try{var t=localStorage.getItem("dl_theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>']
    ld = None
    if art:
        ld = {'@context': 'https://schema.org', '@type': 'Article', 'headline': short, 'description': desc,
              'url': url, 'image': SITE + '/assets/brand/og-default.png', 'inLanguage': 'en',
              'publisher': {'@type': 'Organization', 'name': 'DugoutLab', 'url': SITE + '/',
                            'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/brand/apple-touch-icon.png'}}}
    elif f == 'index.html':
        ld = {'@context': 'https://schema.org', '@type': 'WebSite', 'name': 'DugoutLab', 'url': SITE + '/', 'description': desc,
              'publisher': {'@type': 'Organization', 'name': 'DugoutLab', 'url': SITE + '/',
                            'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/brand/apple-touch-icon.png'}}}
    if ld:
        out.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace('</', '<\\/') + '</script>')
    out.append('<!-- /dl:head -->')
    return '\n' + '\n'.join(out)
def with_head(f, s):
    s = HEAD_RE.sub('', s)
    s = re.sub(r'\n?<meta name="theme-color"[^>]*>', '', s)
    anchor = re.search(r'<meta name="description"[^>]*>', s) or re.search(r'</title>', s)
    return s[:anchor.end()] + head_block(f, s) + s[anchor.end():]

def main():
    fix = '--fix' in sys.argv
    problems = []
    files = sorted(glob.glob('*.html') + glob.glob('articles/*.html') + glob.glob('js/*.js') + glob.glob('css/*.css'))
    html = [f for f in files if f.endswith('.html')]
    inbound = {f: 0 for f in html}
    stubs = set()
    for f in html:
        s = open(f, encoding='utf-8').read()
        if 'http-equiv="refresh"' in s:
            stubs.add(f)
        for h in re.findall(r'href="([^"#?]+\.html)', s):
            t = h.lstrip('/') if h.startswith('/') else os.path.normpath(os.path.join(os.path.dirname(f), h))
            if t in inbound and t != f:
                inbound[t] += 1
    for f in html:
        if not inbound[f] and f not in NO_INBOUND_NEEDED and f not in stubs:
            problems.append(f'{f}: orphan page, nothing links to it')
    # Editorial standard: every Field Notes article opens with the shared TL;DR (docs/EDITORIAL.md)
    for f in sorted(glob.glob('articles/*.html')) + TLDR_PAGES:
        if f in stubs:
            continue
        s = open(f, encoding='utf-8').read()
        if 'data-no-tldr' in s:
            continue
        m = re.search(r'<aside class="tldr"[^>]*>(.*?)</aside>', s, re.S)
        if not m:
            problems.append(f'{f}: missing TL;DR (<aside class="tldr">). See docs/EDITORIAL.md')
            continue
        n = len(re.findall(r'<li>', m.group(1)))
        if not 2 <= n <= 4:
            problems.append(f'{f}: TL;DR needs 2 to 4 bullet points, found {n}')
    idx = open('articles.html', encoding='utf-8').read()
    for f in glob.glob('articles/*.html'):
        if f not in stubs and f not in idx:
            problems.append(f'{f}: missing from the Field Notes index (articles.html)')
    for f in files:
        s = open(f, encoding='utf-8').read()
        if f.endswith('.html'):
            p = '../' if f.startswith('articles/') else ''
            for rx, want, name in ((NAV_RE, nav_ul(p), 'top nav'), (MOBILE_RE, nav_mobile(p), 'hamburger menu')):
                m = rx.search(s)
                if m and m.group(0) != want:
                    if fix:
                        s = rx.sub(lambda _: want, s, count=1)
                        open(f, 'w', encoding='utf-8').write(s)
                        print(f'fixed {name}:', f)
                    else:
                        problems.append(f'{f}: {name} differs from the canonical menu (run --fix)')
        if f.endswith('.html') and f not in stubs and f != '404.html' and '<title>' in s:
            want_s = with_head(f, s)
            if want_s != s:
                if fix:
                    s = want_s
                    open(f, 'w', encoding='utf-8').write(s)
                    print('fixed head:', f)
                else:
                    problems.append(f'{f}: shared <head> block missing or stale (run --fix)')
        if f.endswith('.html') and FOOTER_RE.search(s):
            want = FOOTER.format(p='../' if f.startswith('articles/') else '')
            if FOOTER_RE.search(s).group(0) != want:
                if fix:
                    s = FOOTER_RE.sub(lambda m: want, s, count=1)
                    open(f, 'w', encoding='utf-8').write(s)
                    print('fixed footer:', f)
                else:
                    problems.append(f'{f}: footer differs from the canonical footer (run --fix)')
        for label, pat in BANNED:
            if f in EXEMPT.get(label, ()):
                continue
            for m in re.finditer(pat, s):
                line = s.count('\n', 0, m.start()) + 1
                problems.append(f'{f}:{line}: {label}: "{m.group(0)}"')
    if problems:
        print('\n'.join(problems))
        print(f'\nDRIFT: {len(problems)} problem(s)')
        sys.exit(1)
    print(f'CLEAN: {len(files)} files checked')

if __name__ == '__main__':
    main()
