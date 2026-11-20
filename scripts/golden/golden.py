#!/usr/bin/env python3
# VENDORED COPY. Do not edit here; change the playbook copy and re-vendor.
# source path:   /workspaces/playbook/web/golden.py  (Preston2012/playbook, web/golden.py)
# source commit: 171b1db (branch claude/golden-lastmod-s436, playbook PR 6; T-798 lastmod rule, asset-array sort fix)
# source sha256: 58ba3f2af90b5d91b06f6340720336c4382dac7d5e7ee2a461be8752404ac8b3
# The sha256 is of the source file; recompute it with this header block (lines 2 to END VENDOR HEADER) removed. CI does that before verify.
# END VENDOR HEADER
"""Build-output goldens for a static site. Capture a baseline, verify against it.

WHY THE BUILD OUTPUT AND NOT SCREENSHOTS. wf-seabreeze golden-tests Flutter
widgets as PNGs, which is the right idea in a medium where the widget IS the
output. For an Astro site the deployed artefact is the dist tree, and comparing it
directly is both stricter and cheaper: no browser, no flake, and a diff that
names the file and the line rather than a pixel region. Screenshots can sit on
top of this later; they cannot replace it.

THE ONE NORMALISATION, AND IT WAS MEASURED, NOT ASSUMED. Building winterscode
twice from identical source produced 238 files with identical names and only
four differing bytes, every difference a generated tooltip id of the form
the build clock, the island key, the data-source flag. Nothing else in the
tree varies between runs. So exactly that pattern is normalised and nothing
else. A normalisation that hid more would hide real changes, which is how a
golden becomes a rubber stamp.

SITEMAP LASTMOD IS NORMALISED (T-798, S436). A site that derives <lastmod> from the
newest git commit touching a page (winterscode does, in astro.config.mjs) moves its
sitemap whenever a src file is edited, so every src PR would carry a sitemap-only
recapture. The date is a function of git history, not of the page bytes, so the contents
of every <lastmod> element in a sitemap*.xml file are replaced by GOLDEN before hashing.
The URL set, order, changefreq and priority are still compared byte-exact; only the date
is smoothed. The cost, stated: a wrong lastmod will no longer fail the golden.

THE REPO ROOT IS A TOKEN, FOR EVERY TEXT FILE. The Astro Cloudflare adapter
writes the absolute folder it was built in into dist/server/entry.mjs and
dist/server/wrangler.json (for example "<root>/wrangler.jsonc"). The same commit
built in two folders differs in those two files by that path and by nothing else
(measured, S429: replace each folder's path with one token and the bytes are
equal, apart from the per-build key already normalised below). Without the rule
a golden captured in one folder can never verify from another, and every deploy
from a fresh worktree is refused. So the repo's own absolute root (and its
resolved real path, if different) is replaced by @GOLDEN_ROOT@ in every text
file, and nothing else about a path is touched: any other path, and a path under
a different root, still moves the golden. A file is binary if its first 8 KiB
holds a NUL byte, and binary files are hashed byte-exact, because a path-shaped
run of bytes inside an image or font is not a path. The rule changes every
manifest hash for a file that contains the root, once, so those baselines need
one recapture with --update.

WHAT A PASS DOES NOT MEAN. This proves the build emits the same bytes. It says
nothing about whether those bytes are correct, whether the site renders, or
whether a dependency changed behaviour that only shows at runtime. Lighthouse,
the a11y and CLS probes and the live header check answer different questions and
none of them substitutes for another.

usage:
  golden.py capture REPO [--update]   build, then write .goldens/ as the baseline
  golden.py verify  REPO              build, then diff against .goldens/
Exit 0 identical, 1 differences found, 2 could not run.
"""
import hashlib
import os
import re
import subprocess
import sys

# EVERY RULE HERE WAS MEASURED BY BUILDING THE SAME SOURCE TWICE AND DIFFING,
# never guessed, and each one is printed on every run so it cannot rot in
# silence. A normalisation that hides more than it names is how a golden becomes
# a rubber stamp.
NORMALISERS = [
    (re.compile(rb"updated \d{1,2}:\d{2} [AP]M PT"), b"updated GOLDEN PT",
     "the build clock rendered into the wall status line"),
    (re.compile(rb'"key":"[A-Za-z0-9+/]{43}="'), b'"key":"GOLDEN="',
     "the Astro per-build server island and session key, new on every build"),
    (re.compile(rb'data-(mod-)?source="(live|fallback)"'), b'data-source="GOLDEN"',
     "whether the build reached the live data source, which is network state and not code"),
    (re.compile(rb">(live|fallback)</span>"), b">GOLDEN</span>",
     "the badge text that carries the same build-time fetch outcome"),
]

# DECLARED VOLATILE, WITH THE REASON, BECAUSE SMOOTHING THIS WOULD BE A LIE.
# A page that renders live-fetched numbers at build time changes when the numbers
# change, and no normalisation can tell that apart from the code breaking. So it
# is named here, its differences are still PRINTED on every run, and they do not
# fail the check. What that costs is stated rather than hidden: a real regression
# in this page will not be caught by the golden and needs a human or a different
# probe.
VOLATILE = {
    "client/wall.html": "renders live deploy, Lighthouse and Observatory figures fetched at build time",
    "client/changelog.html": "auto-generated from git log at build time, so it moves on every commit including the one that captures the baseline",
}

GOLDEN_DIR = ".goldens"
MANIFEST = "manifest.tsv"


def die(msg, code=2):
    print("REFUSED: " + msg)
    sys.exit(code)


# One complete JSON string member that starts with a rooted path, escapes included, so a comma, a bracket or an
# escaped quote inside a value can never be mistaken for a member boundary.
PATH_MEMBER = rb'"/(?:[^"\\]|\\.)*"'
PATH_ARRAY = re.compile(rb"\[" + PATH_MEMBER + rb"(?:," + PATH_MEMBER + rb")+\]")
MEMBER = re.compile(PATH_MEMBER)


def sort_path_arrays(raw):
    """Order inside asset arrays is filesystem iteration order and varies per build.

    Sorting the members rather than dropping the file keeps the check useful: an
    asset added or removed still changes the sorted set and still shows up. Only
    arrays whose every member is a rooted path string are touched, so a real array of
    strings that happens to be ordered on purpose is never touched.

    Each member is parsed as a whole string, quotes and escapes included, the values
    are sorted, and the array is rebuilt with every member quoted the same way
    (Codex P2 on winterscode PR 50: the old version cut off the brackets only, so the
    first and last members lost their quote pairing and the sort was unstable).
    """
    def fix(m):
        members = MEMBER.findall(m.group(0))
        return b"[" + b",".join(sorted(members, key=lambda t: t[1:-1])) + b"]"
    return PATH_ARRAY.sub(fix, raw)


ROOT_TOKEN = b"@GOLDEN_ROOT@"

# Sitemap files only (sitemap.xml, sitemap-0.xml, sitemap-index.xml ...), matched on the file's own name.
SITEMAP_NAME = re.compile(r"(^|/)sitemap[^/]*\.xml$")
LASTMOD = re.compile(rb"<lastmod>[^<]*</lastmod>")
LASTMOD_WHY = "the sitemap lastmod, derived from git history and not from the page bytes"


def is_binary(raw):
    return b"\0" in raw[:8192]


def roots_of(root):
    """The absolute root as given and as resolved, longest first, as bytes."""
    found = {os.path.abspath(root), os.path.realpath(root)}
    return sorted((r.rstrip("/").encode() for r in found if r.rstrip("/")), key=len, reverse=True)


def replace_root(raw, root):
    """Replace the repo's own absolute root with a fixed token in a text file.

    Binary files are returned untouched. Only the root itself is replaced, not
    any other path, so a real change in a path still moves the golden.
    """
    if root is None or is_binary(raw):
        return raw
    # A match must stand alone as a path: no path-name character right before or after it, so a sibling folder
    # whose name merely starts with the root (/work/site against /work/site-old) or a longer path ending in it
    # (/x/work/site) is not replaced and still moves the golden (Codex P2 on playbook PR 5).
    for r in roots_of(root):
        raw = re.sub(rb"(?<![A-Za-z0-9._-])" + re.escape(r) + rb"(?![A-Za-z0-9._-])", ROOT_TOKEN, raw)
    return raw


def normalise(path, raw, root=None):
    """Applied to HTML and to the server bundle, because both carry per-build values.
    The repo root token applies to every text file, whatever its extension."""
    raw = replace_root(raw, root)
    if SITEMAP_NAME.search(path):
        raw = LASTMOD.sub(b"<lastmod>GOLDEN</lastmod>", raw)
    if path.endswith((".html", ".htm", ".mjs", ".js")):
        for pattern, repl, _why in NORMALISERS:
            raw = pattern.sub(repl, raw)
        raw = sort_path_arrays(raw)
    return raw


def print_normalisers():
    print("normalised on every file, and nothing else:")
    for _p, repl, why in NORMALISERS:
        print("  %-22s %s" % (repl.decode(), why))
    print("  %-22s %s" % (ROOT_TOKEN.decode(), "the repo's own absolute build folder, in text files only; binary files byte-exact"))
    print("  %-22s %s" % ("<lastmod>GOLDEN", LASTMOD_WHY))
    print("  %-22s %s" % ("sorted path arrays", "asset list order, which is filesystem iteration order and not content"))


def walk(dist, root=None):
    out = {}
    for dp, _, fs in os.walk(dist):
        for f in sorted(fs):
            # The deploy stamp is written by the deploy helper after the build,
            # and carries the time it deployed. It is deploy metadata, not build
            # output, so a baseline that included it would move on every ship.
            if f == "_deploy.json":
                continue
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, dist).replace(os.sep, "/")
            raw = open(p, "rb").read()
            norm = normalise(rel, raw, root)
            out[rel] = (len(norm), hashlib.sha256(norm).hexdigest())
    return out


def build(repo):
    r = subprocess.run(["npm", "run", "build"], cwd=repo, capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        print(r.stdout[-2000:])
        print(r.stderr[-2000:])
        die("the build failed, so there is nothing to compare", 2)
    # S283: Astro writes dist, Next with static export writes out. Two client
    # sites answered "no dist/" and got no baseline at all, on the night a
    # silent visual regression had been live for a week. The directory the
    # build actually produced is the artefact, whatever it is called, and the
    # one it picked is printed so a baseline can never be quietly taken from
    # somewhere other than the deployed tree.
    for name in ("dist", "out", "build"):
        cand = os.path.join(repo, name)
        if os.path.isdir(cand):
            if name != "dist":
                print("  build output read from %s/ rather than dist/" % name)
            return cand
    die("no dist/, out/ or build/ after a successful build at " + repo, 2)


def built_dir(repo):
    """The build output already on disk, found the same way build() finds it,
    without running the build. For the ship gate: it has to judge the exact
    bytes that are about to be uploaded, and rebuilding would replace them."""
    for name in ("dist", "out", "build"):
        cand = os.path.join(repo, name)
        if os.path.isdir(cand):
            if name != "dist":
                print("  build output read from %s/ rather than dist/" % name)
            return cand
    die("no dist/, out/ or build/ at " + repo + ", so there is nothing built to compare", 2)


def read_manifest(repo):
    p = os.path.join(repo, GOLDEN_DIR, MANIFEST)
    if not os.path.isfile(p):
        return None
    m = {}
    for line in open(p, encoding="utf-8"):
        if line.startswith("#") or not line.strip():
            continue
        rel, size, sha = line.rstrip("\n").split("\t")
        m[rel] = (int(size), sha)
    return m


def cmd_capture(repo, update):
    gd = os.path.join(repo, GOLDEN_DIR)
    if os.path.exists(os.path.join(gd, MANIFEST)) and not update:
        die("a baseline already exists. Pass --update to replace it deliberately, "
            "which is the only way it should ever move", 2)
    cur = walk(build(repo), repo)
    print_normalisers()
    os.makedirs(gd, exist_ok=True)
    with open(os.path.join(gd, MANIFEST), "w", encoding="utf-8") as fh:
        fh.write("# build-output golden. path\tbytes\tsha256 of normalised content\n")
        fh.write("# only the volatiles named in NORMALISERS and the repo root token are normalised; nothing else is\n")
        for rel in sorted(cur):
            size, sha = cur[rel]
            fh.write("%s\t%d\t%s\n" % (rel, size, sha))
    print("captured %d file(s) to %s/%s" % (len(cur), GOLDEN_DIR, MANIFEST))
    return 0


def cmd_verify(repo, rebuild=True):
    base = read_manifest(repo)
    if base is None:
        die("no baseline at %s/%s. Run capture first, before the change you want to judge" % (GOLDEN_DIR, MANIFEST), 2)
    cur = walk(build(repo) if rebuild else built_dir(repo), repo)
    print_normalisers()
    added = sorted(set(cur) - set(base))
    removed = sorted(set(base) - set(cur))
    changed_all = sorted(k for k in set(base) & set(cur) if base[k][1] != cur[k][1])
    volatile = [k for k in changed_all if k in VOLATILE]
    changed = [k for k in changed_all if k not in VOLATILE]
    for rel in volatile:
        print("  volatile %s  %d -> %d bytes  (%s)" % (rel, base[rel][0], cur[rel][0], VOLATILE[rel]))
    if not (added or removed or changed):
        print("GOLDEN HOLDS: %d file(s) byte-identical, %d declared volatile." % (len(cur) - len(volatile), len(volatile)))
        print("  What that does not mean: the bytes are unchanged, not that they are correct.")
        return 0
    print("GOLDEN MOVED. %d added, %d removed, %d changed." % (len(added), len(removed), len(changed)))
    for rel in added[:20]:
        print("  added    %s" % rel)
    for rel in removed[:20]:
        print("  removed  %s" % rel)
    for rel in changed[:20]:
        print("  changed  %s  %d -> %d bytes" % (rel, base[rel][0], cur[rel][0]))
    more = (len(added) + len(removed) + len(changed)) - min(20, len(added)) - min(20, len(removed)) - min(20, len(changed))
    # S283: the whole list goes to a file every time, because the one run where
    # the cap matters is a major bump, and that is exactly the run where somebody
    # reads the first twenty lines and calls it the finding. Against Astro 7 this
    # printed twenty of forty-seven changed files and said so in a line that is
    # easy to scroll past.
    full = os.path.join(repo, GOLDEN_DIR, "last-diff.tsv")
    with open(full, "w") as fh:
        fh.write("state\tpath\tbase_bytes\tnew_bytes\n")
        for rel in added:
            fh.write("added\t%s\t\t%d\n" % (rel, cur[rel][0]))
        for rel in removed:
            fh.write("removed\t%s\t%d\t\n" % (rel, base[rel][0]))
        for rel in volatile:
            fh.write("volatile\t%s\t%d\t%d\n" % (rel, base[rel][0], cur[rel][0]))
        for rel in changed:
            fh.write("changed\t%s\t%d\t%d\n" % (rel, base[rel][0], cur[rel][0]))
    if more > 0:
        print("  and %d more" % more)
    print("  WHOLE LIST: %s" % full)
    print("")
    print("  Every difference is either intended or a regression, and this tool")
    print("  cannot tell you which. Read them, then re-capture with --update if")
    print("  they are all intended.")
    return 1


def main():
    if len(sys.argv) < 3:
        die("usage: golden.py capture|verify|verify-built REPO [--update]", 2)
    cmd, repo = sys.argv[1], os.path.abspath(sys.argv[2])
    if not os.path.isfile(os.path.join(repo, "package.json")):
        die("no package.json at " + repo, 2)
    if cmd == "capture":
        return cmd_capture(repo, "--update" in sys.argv[3:])
    if cmd == "verify":
        return cmd_verify(repo)
    if cmd == "verify-built":
        # Same comparison as verify, against the build already on disk. The
        # ship gate uses this, because it must judge what is about to upload.
        return cmd_verify(repo, rebuild=False)
    die("unknown command " + cmd, 2)


if __name__ == "__main__":
    sys.exit(main())
