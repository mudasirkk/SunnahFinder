# SunnahFinder 🕌

A fast, clutter-free way to look up and search hadith — built because finding
things on the existing hadith sites is harder than it should be.

**No accounts. No backend. No build step.** Just a static page that searches
the major collections right in your browser.

## Features

- **One search box for everything** — type words to full-text search, or a
  reference like `bukhari 5062` / `muslim 1` / `abu dawud 4290` to jump
  straight to that hadith.
- **Real full-text search** with phrase support (`"best among you"`),
  match highlighting, and relevance ranking. Every meaningful word must
  appear as a whole word — filler words ("to", "of") are ignored, terms
  never match fragments inside other words, and light stemming makes
  "kindness" match "kind"/"kindly". Ranking favors hadith where your words
  appear close together and hadith filed under a matching chapter title.
  When few hadith contain every word, near misses appear under a labeled
  "Close matches" section.
- **Filters** — narrow results by narrator (matches the narration's
  attribution line, e.g. "Aisha") and by grade classification
  (Sahih / Hasan / Da'if / ungraded). Filters live in the URL, so filtered
  searches are shareable.
- **Arabic search** — type a query in Arabic script (e.g. `الأعمال بالنيات`)
  and it searches the Arabic texts of the selected collections, with hamza
  and diacritic differences folded away and results shown right-to-left.
- **Transliteration-aware search** — `salah`, `salat` or `salaat` all match,
  and common transliterated terms also match the word the translations use
  (`wudu` finds "ablution", `sawm` finds "fasting"). These equivalences only
  widen the *search*; the displayed texts remain verbatim.
- **Nine collections**: Sahih al-Bukhari, Sahih Muslim, Sunan an-Nasa'i,
  Sunan Abi Dawud, Jami` at-Tirmidhi, Sunan Ibn Majah, Muwatta Malik, the
  Forty Hadith of an-Nawawi, and the Forty Hadith Qudsi. Pick which ones to
  search with one click.
- **Hadith pages** show the Arabic text alongside the English translation,
  the chapter it belongs to, scholars' authenticity gradings (Sahih / Hasan /
  Da'if, color-coded), previous/next navigation, copy-text and copy-link
  buttons, and a cross-link to sunnah.com.
- **Copy that pastes well anywhere** — every hadith has *Copy text* (plain,
  readable), *Copy Markdown* (notes apps, Obsidian, GitHub), and *Copy for
  Docs* (rich text that keeps formatting in Word / Google Docs). Copies
  include the reference, Arabic, translation, recorded grade, chapter and a
  source link — all verbatim. Every result card also has a one-tap Copy button.
- **Similar narrations** — each hadith page lists parallel narrations found
  in the downloaded collections by mechanical text-overlap matching (the
  match percentage is shown). The linked texts are verbatim; nothing is
  inferred or written by the app.
- **Explanations & commentary links** — each hadith page links out to the
  same hadith (or a targeted search for it) on established sites:
  Sunnah.com (isnad, alternative translations), Dorar.net (Arabic takhrij
  and scholars' rulings) and IslamQA.info (fatwas citing the narration).
  SunnahFinder itself never generates commentary.
- **Browse mode** — every collection can be browsed chapter by chapter.
- **Shareable URLs** — every search and every hadith has a stable `#/…` link.
- **Offline-friendly** — collections download once (~1–5 MB each) and are
  cached in your browser, so repeat searches are instant and work offline.
- **Settings** — theme (auto/light/dark) plus separate English and Arabic
  font choices (loaded from Google Fonts on demand). Your chosen fonts are
  embedded when you use "Copy for Docs", so pasted text keeps the same look.
- **Mobile-friendly** — responsive layout, comfortable touch targets, no
  horizontal scrolling, `/` focuses the search box on desktop.

## Running it

It's a static site — serve the folder with anything:

```bash
# any one of these, from the repo root:
npx serve .
python3 -m http.server 8080
php -S localhost:8080
```

Then open `http://localhost:8080`. There is nothing to install, configure, or
sign up for. It also works on any static host (GitHub Pages, Netlify, etc.).

## How it works

- Hadith texts come from the open
  [fawazahmed0/hadith-api](https://github.com/fawazahmed0/hadith-api) dataset,
  fetched from jsDelivr with an automatic fallback mirror
  (raw.githubusercontent.com). The data is pinned to an immutable release tag
  and cached with the browser Cache Storage API.
- Search runs entirely client-side (`js/search.js`): text is normalized
  (case, accents, apostrophes, Arabic diacritics), queries support quoted
  phrases, and results are ranked by whole-word/phrase/position scoring.
- The UI (`js/app.js`) is a small hash-router with views for home, search
  results, collection chapters, and hadith detail. No frameworks.

## A note on the texts — nothing is generated

Every piece of content displayed or copied (Arabic, translations, chapter
names, gradings) is reproduced **verbatim** from the dataset; the app never
writes, summarizes or paraphrases religious content. "Similar narrations"
are found by mechanical comparison of the verbatim texts, and "Explanations"
are outbound links to external sites only. Gradings shown are those of the
named scholars (e.g. al-Albani) — for anything that matters, verify with a
qualified scholar.
