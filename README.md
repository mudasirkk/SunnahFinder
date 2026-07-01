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
  match highlighting, and relevance ranking. Every word must match (AND), so
  results stay on-topic.
- **Nine collections**: Sahih al-Bukhari, Sahih Muslim, Sunan an-Nasa'i,
  Sunan Abi Dawud, Jami` at-Tirmidhi, Sunan Ibn Majah, Muwatta Malik, the
  Forty Hadith of an-Nawawi, and the Forty Hadith Qudsi. Pick which ones to
  search with one click.
- **Hadith pages** show the Arabic text alongside the English translation,
  the chapter it belongs to, scholars' authenticity gradings (Sahih / Hasan /
  Da'if, color-coded), previous/next navigation, copy-text and copy-link
  buttons, and a cross-link to sunnah.com.
- **Browse mode** — every collection can be browsed chapter by chapter.
- **Shareable URLs** — every search and every hadith has a stable `#/…` link.
- **Offline-friendly** — collections download once (~1–5 MB each) and are
  cached in your browser, so repeat searches are instant and work offline.
- **Dark mode**, mobile-friendly layout, `/` focuses the search box.

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

## A note on the texts

Translations and gradings are reproduced as recorded in the dataset. Gradings
shown are those of the named scholars (e.g. al-Albani) — for anything that
matters, verify with a qualified scholar.
