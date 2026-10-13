#!/usr/bin/env python3
"""DugoutLab drift guard.

  python3 .github/scripts/check_site.py         check only, exit 1 on any drift
  python3 .github/scripts/check_site.py --fix   rewrite every standard footer to the canonical one, then check

Rules live here, in one place. Change the rule here, run --fix, commit.
"""
import glob, re, sys

FOOTER = '''<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <div class="logo">Dugout<span>Lab</span></div>
      <p>Honest, evidence-checked coaching for Little League and rec ball coaches.</p>
    </div>
    <div class="footer-links">
      <h4>Tools</h4>
      <ul>
        <li><a href="{p}framework.html">Practice Framework</a></li>
        <li><a href="{p}lineup.html">Lineup Builder</a></li>
        <li><a href="{p}training.html">Training</a></li>
      </ul>
    </div>
    <div class="footer-links">
      <h4>Learn</h4>
      <ul>
        <li><a href="{p}articles.html">All Articles</a></li>
        <li><a href="{p}stages.html">The 4 Stages</a></li>
        <li><a href="{p}progression.html">Season Plan</a></li>
        <li><a href="{p}about.html">About</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>&copy; 2026 DugoutLab. Free resource for volunteer coaches.</span>
    <span>dugoutlab.com</span>
  </div>
</footer>'''

# (label, regex) checked against every .html / .js / .css file
BANNED = [
    ('em dash',                 r'—|&mdash;|&#8212;|&#x2014;'),
    ('always-free promise',     r'(?i)free,\s*(always|forever)|always\s+free|free\s+forever|always\.\s*no paywall|always will be|made free'),
    ('GamedayHelpers mention',  r'(?i)gameday\s*helpers'),
    ('sponsor block',           r'(?i)footer-sponsor|sponsor-line|our sponsor|sponsored by'),
    ('AI disclosure',           r'(?i)AI assistance|AI-assisted|compiled with AI|footer-disclosure|notes for claude'),
    ('dead builder.html link',  r'href="(\.\./)?builder\.html"'),
    ('old tool name',           r'(?i)practice builder'),
    ('emoji',                   '[\U0001F000-\U0001FAFF]'),
]
FOOTER_RE = re.compile(r'<footer class="footer">.*?</footer>', re.S)

def main():
    fix = '--fix' in sys.argv
    problems = []
    files = sorted(glob.glob('*.html') + glob.glob('articles/*.html') + glob.glob('js/*.js') + glob.glob('css/*.css'))
    for f in files:
        s = open(f, encoding='utf-8').read()
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
