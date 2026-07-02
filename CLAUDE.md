# SunnahFinder — development notes

Static, no-build web app (plain HTML/CSS/JS). Serve the repo root with any
static server (`http-server -p 8099 -s`) — there is nothing to compile.

## Non-negotiable rules

1. **Web AND mobile, every change.** Any UI change must be verified at BOTH a
   desktop viewport (~1200×900) and a mobile viewport (390×844, `isMobile`,
   touch) before it ships: no horizontal overflow, touch targets ≥ ~38px,
   inputs use `font-size: 16px` on mobile (prevents iOS focus-zoom), and
   overlays/panels must fit the small screen. The mobile media query lives at
   the bottom of `css/styles.css` (`@media (max-width: 560px)`).
2. **Nothing is generated.** Every displayed or copied text (Arabic,
   translations, chapter names, grades) is verbatim from a pinned dataset:
   fawazahmed0/hadith-api (tag `@1`); AhmedBaset/hadith-json (tag `v1.2.0`,
   a sunnah.com scrape; books with `src: 'hj'`); or, for Hisn al-Muslim,
   wafaaelmaandy/Hisn-Muslim-Json, snapshotted by `tools/build-hisn.mjs`
   into the committed static file `data/hisn.json` (books with
   `src: 'snapshot'`). Search expansions, similarity matching and external
   links may guide *finding*; they must never alter or fabricate *content*.
   hadith-json numbering: books whose chapter id 0 sits at the end of the
   file get chapter-resorted + renumbered to match sunnah.com (see
   `convertHJ`); validate against anchor hadith when touching this. When
   adding a book from a new source, validate it (counts, numbering vs
   sunnah.com anchors, and ideally cross-check against an independent copy)
   before trusting it — see how Hisn was vetted.

## Verification

End-to-end tests are Playwright scripts driven against a local server, with
the CDN mocked from pre-downloaded JSON via `context.route()` (abort
cdn.jsdelivr.net to exercise the raw.githubusercontent fallback). Cover at
minimum: home, search (English, Arabic, transliteration), filters, hadith
detail (Arabic load, grades, copy formats incl. clipboard read-back),
browsing, settings, and the mobile-viewport pass from rule 1.

## Layout

- `js/data.js` — collections list, edition download/cache (Cache Storage
  API + in-memory), per-edition indexes (`_norm`, stemmed `_postings`,
  chapter-title `_secStems`), parallel-narration matching.
- `js/search.js` — normalization (Arabic folding), stemmer, transliteration
  equivalence groups, word-boundary search with close-match fallback,
  highlighting.
- `js/app.js` — hash router, views, filters, settings (theme + fonts),
  copy formats (plain / Markdown / rich HTML with embedded fonts).

## Branches

Develop on `claude/hadith-lookup-app-s9qvv8`; the live site (GitHub Pages,
custom domain via CNAME) deploys from `main`. `main` has a merge history —
merge the working branch into it (fast-forward will fail).
