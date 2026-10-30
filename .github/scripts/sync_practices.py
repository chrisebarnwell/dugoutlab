#!/usr/bin/env python3
"""
Practice Library sync.
Google Sheet (published CSV) -> rule check -> data/practices.json + data/practice-library.csv

Sheet = where you edit. Git = the published copy and the backup.
- Only rows with status = live are published.
- data/practice-library.csv is a full backup of every live row, in Sheet column
  order. If the Sheet is ever lost, import that file to rebuild it.
- Drafts are not copied to git (they may hold unreviewed text). Google Sheets
  version history covers them.

Safety guards (nothing ever gets wiped by accident):
- Sheet unreachable, empty, or headers changed -> keep the last good files, fail.
- Live rows drop by more than 30 percent in one run -> keep the last good files,
  fail. Run the workflow with force = true if the drop is on purpose.
- Bad rows are skipped and listed; good rows still publish; the job then fails
  so GitHub emails you the list.

Env:
  PRACTICES_CSV_URL   published CSV link of the Library tab (repo variable)
  PRACTICE_BLOCKLIST  optional, comma separated kid first names (repo secret)
  FORCE               "true" to allow a big drop
"""
import csv, io, json, os, re, sys, urllib.request

OUT_JSON = "data/practices.json"
OUT_CSV = "data/practice-library.csv"

COLUMNS = ["status", "practice", "block", "order", "title", "minutes", "stage", "sport",
           "players", "gear", "setup", "how", "cue", "why", "source", "origin", "tags",
           "watch", "harder", "easier"]
CORE_COLUMNS = COLUMNS[:17]  # watch, harder, easier are optional

BLOCKS = {"warm-up", "core", "game", "cool-down"}
STAGES = {"4-6", "7-12", "13-15", "16+"}
SPORTS = {"baseball", "softball", "both"}
ORIGINS = {"ballers", "idea"}
REQUIRED = ["practice", "block", "order", "title", "stage", "sport", "how", "source", "origin"]
TEXT = ["practice", "title", "players", "gear", "setup", "how", "cue", "why", "source",
        "tags", "watch", "harder", "easier"]

# Site rule: no public throwing / pitching mechanics or arm-care content.
BANNED = [
    "arm care", "arm-care", "long toss", "throwing program", "pitching mechanics",
    "throwing mechanics", "arm slot", "pitch count", "weighted ball", "bullpen",
    "always free", "free forever", "gamedayhelpers",
]
DASHES = re.compile("[—–]")
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")
MAX_DROP = 0.30


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def split_list(s):
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def check(row, names):
    errs = []
    for k in REQUIRED:
        if not row.get(k, "").strip():
            errs.append(f"missing {k}")
    if row.get("block") and row["block"] not in BLOCKS:
        errs.append(f"block must be one of {sorted(BLOCKS)}")
    bad = [s for s in split_list(row.get("stage")) if s not in STAGES]
    if bad:
        errs.append(f"stage must be from {sorted(STAGES)} (comma separated is ok)")
    if row.get("sport") and row["sport"] not in SPORTS:
        errs.append(f"sport must be one of {sorted(SPORTS)}")
    if row.get("origin") and row["origin"] not in ORIGINS:
        errs.append("origin must be ballers or idea")
    o = row.get("order", "").strip()
    if o and not o.isdigit():
        errs.append("order must be a whole number")
    m = row.get("minutes", "").strip()
    if m and not (m.isdigit() and 0 < int(m) <= 120):
        errs.append("minutes must be a whole number 1-120 or blank")
    blob = " ".join(row.get(k, "") for k in TEXT)
    low = blob.lower()
    if DASHES.search(blob):
        errs.append("em/en dash")
    if EMOJI.search(blob):
        errs.append("emoji")
    for b in BANNED:
        if b in low:
            errs.append(f"banned: '{b}'")
    for n in names:
        if re.search(rf"\b{re.escape(n)}\b", low):
            errs.append("kid name found")
            break
    return errs


def fail_keep(msg):
    print(f"STOPPED, last good files kept: {msg}")
    summary(f"### Sync stopped\n{msg}\n")
    return 3


def summary(text):
    with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as f:
        f.write(text)


def main():
    url = os.environ.get("PRACTICES_CSV_URL", "").strip()
    if not url:
        print("PRACTICES_CSV_URL not set. Nothing to do.")
        return 0
    names = [n.strip().lower() for n in os.environ.get("PRACTICE_BLOCKLIST", "").split(",") if n.strip()]
    force = os.environ.get("FORCE", "").lower() == "true"

    try:
        raw = urllib.request.urlopen(url, timeout=30).read().decode("utf-8-sig")
    except Exception as e:
        return fail_keep(f"could not reach the Sheet ({e})")

    reader = csv.DictReader(io.StringIO(raw))
    header = [(h or "").strip().lower() for h in (reader.fieldnames or [])]
    missing = [c for c in CORE_COLUMNS if c not in header]
    if missing:
        return fail_keep(f"Sheet headers changed, missing: {', '.join(missing)}")
    rows = list(reader)
    if not rows:
        return fail_keep("Sheet came back empty")

    blocks, backup, rejects, seen = [], [], [], set()
    for i, r in enumerate(rows, start=2):  # sheet row number
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        if r.get("status", "").lower() != "live":
            continue
        errs = check(r, names)
        bid = f"{slug(r.get('practice',''))}-{slug(r.get('block',''))}-{r.get('order','')}"
        if bid in seen:
            errs.append("same practice + block + order as another live row")
        if errs:
            rejects.append(f"row {i} ({r.get('title') or 'untitled'}): " + "; ".join(errs))
            continue
        seen.add(bid)
        backup.append([r.get(c, "") for c in COLUMNS])
        blocks.append({
            "id": bid,
            "practice": r["practice"],
            "block": r["block"],
            "order": int(r["order"]),
            "title": r["title"],
            "minutes": int(r["minutes"]) if r.get("minutes") else None,
            "stage": split_list(r["stage"]),
            "sport": r["sport"],
            "players": r.get("players", ""),
            "gear": split_list(r.get("gear")),
            "setup": r.get("setup", ""),
            "how": r["how"],
            "cue": r.get("cue", ""),
            "why": r.get("why", ""),
            "watch": r.get("watch", ""),
            "harder": r.get("harder", ""),
            "easier": r.get("easier", ""),
            "source": r["source"],
            "origin": r["origin"],
            "tags": split_list(r.get("tags")),
        })

    # Guard: never let one bad run wipe the library.
    if os.path.exists(OUT_JSON) and not force:
        try:
            prev = len(json.load(open(OUT_JSON, encoding="utf-8")).get("blocks", []))
        except Exception:
            prev = 0
        if prev and len(blocks) < prev * (1 - MAX_DROP):
            return fail_keep(f"live rows dropped from {prev} to {len(blocks)}. "
                             "If that is on purpose, run the workflow with force = true.")

    blocks.sort(key=lambda b: (b["practice"], b["order"]))
    practices = {}
    for b in blocks:
        p = practices.setdefault(b["practice"], {"name": b["practice"], "minutes": 0, "blocks": []})
        p["minutes"] += b["minutes"] or 0
        p["blocks"].append(b["id"])

    out = {"version": 2, "blocks": blocks, "practices": list(practices.values())}
    os.makedirs("data", exist_ok=True)
    write_if_changed(OUT_JSON, json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(COLUMNS)
    w.writerows(backup)
    write_if_changed(OUT_CSV, buf.getvalue())
    print(f"{len(blocks)} live blocks, {len(practices)} practices.")

    if rejects:
        print("\nREJECTED (fix in the Sheet, they publish on the next run):")
        for x in rejects:
            print("  " + x)
        summary("### Rejected rows\n" + "\n".join(f"- {x}" for x in rejects) + "\n")
        return 2
    return 0


def write_if_changed(path, new):
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
    if new != old:
        open(path, "w", encoding="utf-8").write(new)
        print(f"Updated {path}")


if __name__ == "__main__":
    sys.exit(main())
