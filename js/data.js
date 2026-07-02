/* SunnahFinder data layer.
 * Editions come from the open fawazahmed0/hadith-api dataset. Files are
 * immutable (pinned to the @1 tag), so we cache aggressively via the
 * Cache Storage API and fall back between two mirrors.
 */
(function () {
  'use strict';

  /* Two pinned, immutable data sources, each with a CDN + GitHub-raw mirror:
   * - fawazahmed0/hadith-api@1: the nine-plus-forties collections, with
   *   per-scholar grades and separate Arabic editions.
   * - AhmedBaset/hadith-json@v1.2.0: sunnah.com scrape covering the books
   *   the first source lacks (Ahmad, Darimi, Riyad, Adab, Shamail, Bulugh,
   *   Mishkat), English + Arabic in one file, no grades. */
  const MIRRORS = [
    'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1',
    'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1',
  ];
  const HJ_MIRRORS = [
    'https://cdn.jsdelivr.net/gh/AhmedBaset/hadith-json@v1.2.0/db/by_book',
    'https://raw.githubusercontent.com/AhmedBaset/hadith-json/v1.2.0/db/by_book',
  ];
  // Pre-converted books committed under /data (see tools/), served same-origin.
  const SNAPSHOT_BASE = ['data'];

  const CACHE_NAME = 'sunnahfinder-data-v1';

  // The nine canonical collections in this dataset, plus the two forty-hadith
  // compilations. `approxMB` is shown before the one-time download.
  const BOOKS = [
    { id: 'bukhari',  name: 'Sahih al-Bukhari',        short: 'Bukhari',   approxMB: 5,   sunnah: 'bukhari' },
    { id: 'muslim',   name: 'Sahih Muslim',            short: 'Muslim',    approxMB: 4,   sunnah: 'muslim' },
    { id: 'nasai',    name: "Sunan an-Nasa'i",         short: "Nasa'i",    approxMB: 3,   sunnah: 'nasai' },
    { id: 'abudawud', name: 'Sunan Abi Dawud',         short: 'Abu Dawud', approxMB: 4,   sunnah: 'abudawud' },
    { id: 'tirmidhi', name: 'Jami` at-Tirmidhi',       short: 'Tirmidhi',  approxMB: 3,   sunnah: 'tirmidhi' },
    { id: 'ibnmajah', name: 'Sunan Ibn Majah',         short: 'Ibn Majah', approxMB: 3,   sunnah: 'ibnmajah' },
    { id: 'malik',    name: 'Muwatta Malik',           short: 'Malik',     approxMB: 1,   sunnah: null },
    { id: 'ahmad',    name: 'Musnad Ahmad',            short: 'Ahmad',     approxMB: 2,   sunnah: 'ahmad',   src: 'hj', hjPath: 'the_9_books/ahmed' },
    { id: 'darimi',   name: 'Sunan ad-Darimi',         short: 'Darimi',    approxMB: 3,   sunnah: 'darimi',  src: 'hj', hjPath: 'the_9_books/darimi', araOnly: true },
    { id: 'riyadussalihin', name: 'Riyad as-Salihin',  short: 'Riyad',     approxMB: 2,   sunnah: 'riyadussalihin', src: 'hj', hjPath: 'other_books/riyad_assalihin' },
    { id: 'adab',     name: 'Al-Adab Al-Mufrad',       short: 'Adab',      approxMB: 2,   sunnah: 'adab',    src: 'hj', hjPath: 'other_books/aladab_almufrad' },
    { id: 'shamail',  name: 'Shama’il Muhammadiyah', short: 'Shamail', approxMB: 0.5, sunnah: 'shamail', src: 'hj', hjPath: 'other_books/shamail_muhammadiyah' },
    { id: 'bulugh',   name: 'Bulugh al-Maram',         short: 'Bulugh',    approxMB: 2,   sunnah: 'bulugh',  src: 'hj', hjPath: 'other_books/bulugh_almaram' },
    { id: 'mishkat',  name: 'Mishkat al-Masabih',      short: 'Mishkat',   approxMB: 5,   sunnah: 'mishkat', src: 'hj', hjPath: 'other_books/mishkat_almasabih' },
    { id: 'nawawi',   name: 'Forty Hadith of an-Nawawi', short: 'Nawawi 40', approxMB: 0.1, sunnah: 'nawawi40' },
    { id: 'qudsi',    name: 'Forty Hadith Qudsi',      short: 'Qudsi 40',  approxMB: 0.1, sunnah: 'qudsi40' },
    { id: 'dehlawi',  name: 'Forty Hadith of Shah Waliullah Dehlawi', short: 'Dehlawi 40', approxMB: 0.1, sunnah: 'shahwaliullah40' },
    /* SNAPSHOT-BOOKS:begin */
    /* Books snapshotted to a static data/<id>.json by a tools/ build script
     * (src: 'snapshot'). Hisn built by tools/build-hisn.mjs; Fath al-Bari
     * (Ibn Hajar's Arabic commentary on al-Bukhari) by tools/build-fathbari.mjs. */
    { id: 'hisn', name: 'Hisn al-Muslim', short: 'Hisn', approxMB: 0.3, sunnah: 'hisn', src: 'snapshot' },
    { id: 'fathbari', name: 'Fath al-Bari (Ibn Hajar)', short: 'Fath al-Bari', approxMB: 33, sunnah: null, src: 'snapshot', araOnly: true, commentaryOf: 'bukhari' },
    /* SNAPSHOT-BOOKS:end */
  ];

  // Accepted spellings when parsing reference queries like "bukhari 5062".
  const BOOK_ALIASES = {
    bukhari: ['bukhari', 'bukharee', 'bokhari', 'sahih al-bukhari', 'sahih bukhari', 'sb'],
    muslim: ['muslim', 'sahih muslim', 'sm'],
    nasai: ['nasai', "nasa'i", 'nasaee', 'an-nasai', 'sunan an-nasai', 'nasa i'],
    abudawud: ['abudawud', 'abu dawud', 'abu dawood', 'abu daud', 'abi dawud', 'dawud', 'dawood', 'sunan abi dawud', 'sunan abu dawud'],
    tirmidhi: ['tirmidhi', 'tirmidhee', 'tirmizi', 'at-tirmidhi', 'jami at-tirmidhi'],
    ibnmajah: ['ibnmajah', 'ibn majah', 'ibn maja', 'ibn madjah', 'sunan ibn majah', 'majah'],
    malik: ['malik', 'muwatta', 'muwatta malik', 'muwatta imam malik'],
    nawawi: ['nawawi', 'nawawi40', 'an-nawawi', '40 nawawi', 'forty hadith', 'arbaeen', 'arbain'],
    qudsi: ['qudsi', 'qudsi40', 'hadith qudsi', '40 qudsi'],
    dehlawi: ['dehlawi', 'dehlvi', 'shah waliullah', 'shahwaliullah', 'shahwaliullah40', '40 dehlawi'],
    ahmad: ['ahmad', 'ahmed', 'musnad ahmad', 'musnad ahmed', 'musnad'],
    darimi: ['darimi', 'ad-darimi', 'al-darimi', 'sunan ad-darimi', 'sunan al-darimi'],
    riyadussalihin: ['riyad', 'riyadh', 'riyad as-salihin', 'riyad us-salihin', 'riyadussalihin', 'riyadus salihin', 'riyad al-salihin', 'riyadh as-salihin'],
    adab: ['adab', 'al-adab al-mufrad', 'adab al-mufrad', 'adab almufrad', 'al adab al mufrad'],
    shamail: ['shamail', 'shamaail', 'ash-shamail', 'shamail muhammadiyah', 'shama il'],
    bulugh: ['bulugh', 'bulugh al-maram', 'bulughul maram', 'bulugh maram'],
    mishkat: ['mishkat', 'mishkat al-masabih', 'mishkath', 'mishkaat'],
    hisn: ['hisn', 'hisnul muslim', 'hisn al-muslim', 'hisnul-muslim', 'fortress', 'fortress of the muslim', 'husn'],
    fathbari: ['fathbari', 'fath al-bari', 'fathul bari', 'fath ul bari', 'fath albari', 'ibn hajar', 'sharh bukhari'],
  };

  const memory = new Map();      // "lang:bookId" -> edition object (parsed JSON)
  const inflight = new Map();    // "lang:bookId" -> Promise

  function bookById(id) {
    return BOOKS.find((b) => b.id === id) || null;
  }

  async function cachedFetch(bases, path) {
    const urls = bases.map((m) => m + path);
    let cache = null;
    try {
      cache = await caches.open(CACHE_NAME);
      for (const url of urls) {
        const hit = await cache.match(url);
        if (hit) return hit.json();
      }
    } catch (e) {
      // Cache Storage can be unavailable (file://, private mode). Plain fetch still works.
    }
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status + ' for ' + url); continue; }
        if (cache) {
          try { await cache.put(url, res.clone()); } catch (e) { /* quota exceeded: fine */ }
        }
        return res.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Failed to fetch ' + path);
  }

  /**
   * Load a full edition (one-time ~1–5 MB, then cached).
   * lang 'eng' loads the English translation; 'ara' loads the Arabic text in
   * its search-friendly variant (ara-{book}1: diacritics already removed).
   */
  function loadEdition(bookId, lang) {
    lang = lang || 'eng';
    const key = lang + ':' + bookId;
    if (memory.has(key)) return Promise.resolve(memory.get(key));
    const book = bookById(bookId);
    if (book && book.src === 'snapshot') return loadSnapshot(book).then(() => memory.get(key));
    if (book && book.src === 'hj') return loadHJ(book).then(() => memory.get(key));
    if (inflight.has(key)) return inflight.get(key);
    const path = lang === 'ara'
      ? '/editions/ara-' + bookId + '1.min.json'
      : '/editions/eng-' + bookId + '.min.json';
    const p = cachedFetch(MIRRORS, path)
      .then((ed) => {
        indexEdition(bookId, ed, lang);
        memory.set(key, ed);
        inflight.delete(key);
        return ed;
      })
      .catch((e) => { inflight.delete(key); throw e; });
    inflight.set(key, p);
    return p;
  }

  /* One hadith-json file carries both languages, so a single download
   * (cached) yields the English and Arabic editions together. */
  function loadHJ(book) {
    const key = 'hj:' + book.id;
    if (inflight.has(key)) return inflight.get(key);
    const p = cachedFetch(HJ_MIRRORS, '/' + book.hjPath + '.json')
      .then((raw) => {
        for (const lang of ['eng', 'ara']) {
          const memKey = lang + ':' + book.id;
          if (!memory.has(memKey)) {
            const ed = convertHJ(raw, lang);
            indexEdition(book.id, ed, lang);
            memory.set(memKey, ed);
          }
        }
        inflight.delete(key);
      })
      .catch((e) => { inflight.delete(key); throw e; });
    inflight.set(key, p);
    return p;
  }

  /* Snapshot books are pre-converted static files committed in /data
   * (captured from the sunnah.com API by tools/snapshot-sunnah.mjs). One
   * file holds both language editions already in this app's edition shape. */
  function loadSnapshot(book) {
    const key = 'snap:' + book.id;
    if (inflight.has(key)) return inflight.get(key);
    const p = cachedFetch(SNAPSHOT_BASE, '/' + book.id + '.json')
      .then((raw) => {
        for (const lang of ['eng', 'ara']) {
          const memKey = lang + ':' + book.id;
          if (!memory.has(memKey) && raw[lang]) {
            const ed = raw[lang];
            indexEdition(book.id, ed, lang);
            memory.set(memKey, ed);
          }
        }
        inflight.delete(key);
      })
      .catch((e) => { inflight.delete(key); throw e; });
    inflight.set(key, p);
    return p;
  }

  /**
   * Convert a hadith-json book to this app's edition shape, without touching
   * the texts themselves. Numbering: most books' `idInBook` matches
   * sunnah.com already; where the source misplaced the chapter with id 0 at
   * the end of the file (Riyad, Mishkat, Darimi — sunnah.com puts that
   * chapter FIRST), chapters are re-sorted by id and hadith renumbered
   * sequentially, which reproduces sunnah.com's numbering (verified against
   * known anchors, e.g. Riyad 1 / Mishkat 1 = the intentions hadith).
   */
  function convertHJ(raw, lang) {
    const renumber = raw.chapters.length > 0 && raw.chapters[raw.chapters.length - 1].id === 0;
    const chapterOrder = renumber
      ? raw.chapters.slice().sort((a, b) => (a.id === null ? 1e9 : a.id) - (b.id === null ? 1e9 : b.id))
      : raw.chapters;
    const byChapter = new Map();
    for (const h of raw.hadiths) {
      const cid = h.chapterId;
      if (!byChapter.has(cid)) byChapter.set(cid, []);
      byChapter.get(cid).push(h);
    }

    const textOf = (h) => {
      if (lang === 'ara') return h.arabic || '';
      const narrator = (h.english && h.english.narrator || '').trim();
      const body = (h.english && h.english.text || '').trim();
      return narrator && body ? narrator + '\n' + body : (narrator || body);
    };

    const sections = {};
    const details = {};
    const hadiths = [];
    // Assign numbers first (chapter traversal when renumbering, otherwise
    // the file's own idInBook), then emit hadith in numeric order.
    const numbered = new Map(); // source hadith -> number
    if (renumber) {
      let n = 0;
      for (const c of chapterOrder) {
        for (const h of byChapter.get(c.id) || []) numbered.set(h, ++n);
      }
    } else {
      for (const h of raw.hadiths) numbered.set(h, h.idInBook);
    }
    chapterOrder.forEach((c, i) => {
      const secNum = String(i + 1);
      const hs = byChapter.get(c.id) || [];
      if (!hs.length) return;
      sections[secNum] = (lang === 'ara' ? c.arabic : c.english) || c.english || c.arabic || '';
      const nums = hs.map((h) => numbered.get(h));
      details[secNum] = {
        hadithnumber_first: Math.min.apply(null, nums),
        hadithnumber_last: Math.max.apply(null, nums),
        arabicnumber_first: Math.min.apply(null, nums),
        arabicnumber_last: Math.max.apply(null, nums),
      };
    });
    for (const h of raw.hadiths) {
      const num = numbered.get(h);
      hadiths.push({
        hadithnumber: num,
        arabicnumber: num,
        text: textOf(h),
        grades: [], // this source records no gradings; none are shown
        reference: { book: null, hadith: num },
      });
    }
    hadiths.sort((a, b) => a.hadithnumber - b.hadithnumber);

    const name = raw.metadata && raw.metadata[lang === 'ara' ? 'arabic' : 'english'];
    return {
      metadata: {
        name: (name && name.title) || '',
        sections,
        section_details: details,
      },
      hadiths,
    };
  }

  function isLoaded(bookId, lang) {
    return memory.has((lang || 'eng') + ':' + bookId);
  }

  /** The already-downloaded edition object, or null if not loaded yet. */
  function getEditionSync(bookId, lang) {
    return memory.get((lang || 'eng') + ':' + bookId) || null;
  }

  /* Precompute per-hadith normalized text and a number->index map so
   * searches and lookups are O(1)-ish after the first load. */
  function indexEdition(bookId, ed, lang) {
    const byNumber = new Map();
    const stem = window.SFSearch.stem;
    const postings = (lang || 'eng') === 'eng' ? new Map() : null;

    // Chapter titles ground topical relevance: a hadith filed under
    // "Good manners towards parents" should outrank an incidental mention.
    // One shared Set of stemmed title words per section.
    const secRanges = [];
    const details = ed.metadata.section_details || {};
    const names = ed.metadata.sections || {};
    for (const key of Object.keys(details)) {
      const d = details[key];
      if (!d || !names[key]) continue;
      const stems = new Set();
      for (const w of window.SFSearch.normalize(names[key]).split(' ')) {
        if (w.length >= 2) stems.add(stem(w));
      }
      secRanges.push({ first: Number(d.hadithnumber_first), last: Number(d.hadithnumber_last), stems });
    }
    secRanges.sort((a, b) => a.first - b.first);
    const secOf = (n) => {
      let lo = 0, hi = secRanges.length - 1, hit = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (secRanges[mid].first <= n) { if (n <= secRanges[mid].last) hit = secRanges[mid]; lo = mid + 1; }
        else hi = mid - 1;
      }
      return hit;
    };

    for (let i = 0; i < ed.hadiths.length; i++) {
      const h = ed.hadiths[i];
      h._norm = window.SFSearch.normalize(h.text);
      const sec = secOf(Number(h.hadithnumber));
      h._secStems = sec ? sec.stems : null;
      byNumber.set(String(h.hadithnumber), i);
      if (postings) {
        // Whole-word index keyed by stem, for word-boundary search.
        const seen = new Set();
        for (const w of h._norm.split(' ')) {
          if (w.length < 2) continue;
          const s = stem(w);
          if (seen.has(s)) continue;
          seen.add(s);
          let arr = postings.get(s);
          if (!arr) postings.set(s, (arr = []));
          arr.push(i);
        }
      }
    }
    ed._byNumber = byNumber;
    ed._bookId = bookId;
    ed._lang = lang || 'eng';
    if (postings) ed._postings = postings;
  }

  function getHadith(bookId, number, lang) {
    const ed = memory.get((lang || 'eng') + ':' + bookId);
    if (!ed) return null;
    const idx = ed._byNumber.get(String(number));
    if (idx === undefined) return null;
    return { hadith: ed.hadiths[idx], index: idx, edition: ed };
  }

  /** Fetch the Arabic text of a single hadith (tiny request, also cached;
   * for hadith-json books the Arabic is already in the downloaded file). */
  function loadArabic(bookId, number) {
    const book = bookById(bookId);
    if (book && (book.src === 'hj' || book.src === 'snapshot')) {
      // Both languages arrive in one file for these; read from memory.
      return loadEdition(bookId, 'ara').then(() => {
        const got = getHadith(bookId, number, 'ara');
        return got ? got.hadith.text : null;
      });
    }
    return cachedFetch(MIRRORS, '/editions/ara-' + bookId + '/' + number + '.min.json')
      .then((d) => (d.hadiths && d.hadiths[0] ? d.hadiths[0].text : null));
  }

  /** Section name for a hadith, via metadata.section_details ranges. */
  function sectionOf(ed, hadithnumber) {
    const details = ed.metadata.section_details || {};
    const n = Number(hadithnumber);
    for (const key of Object.keys(details)) {
      const d = details[key];
      if (d && n >= Number(d.hadithnumber_first) && n <= Number(d.hadithnumber_last)) {
        return { number: key, name: (ed.metadata.sections || {})[key] || '' };
      }
    }
    return null;
  }

  function sectionsOf(ed) {
    const secs = ed.metadata.sections || {};
    const details = ed.metadata.section_details || {};
    const out = [];
    for (const key of Object.keys(secs)) {
      if (key === '0' && !secs[key]) continue;
      const d = details[key] || {};
      out.push({
        number: key,
        name: secs[key] || 'Section ' + key,
        first: d.hadithnumber_first,
        last: d.hadithnumber_last,
      });
    }
    out.sort((a, b) => Number(a.number) - Number(b.number));
    return out;
  }

  function hadithsInSection(ed, sectionNumber) {
    const d = (ed.metadata.section_details || {})[sectionNumber];
    if (!d) return [];
    const first = Number(d.hadithnumber_first);
    const last = Number(d.hadithnumber_last);
    return ed.hadiths.filter((h) => {
      const n = Number(h.hadithnumber);
      return n >= first && n <= last;
    });
  }

  /* Common words + narration boilerplate excluded when comparing hadith
   * texts for parallel narrations, so overlap reflects distinctive wording. */
  const STOPWORDS = new Set(('that this with from have will then when what were they them their there which would ' +
    'said says allah allahs messenger prophet narrated upon peace blessings heard people some came went about asked ' +
    'told should shall been being because until while after before other than your more does doing whoever anyone ' +
    'something someone very into against among whom his hers hims come make made give given take taken').split(' '));

  function tokensOf(h) {
    if (h._tokens) return h._tokens;
    const s = new Set();
    for (const w of h._norm.split(' ')) {
      if (w.length >= 4 && !STOPWORDS.has(w)) s.add(w);
    }
    h._tokens = s;
    return s;
  }

  /**
   * Parallel narrations: hadith in the downloaded collections whose verbatim
   * text shares most of its distinctive wording with the given hadith.
   * Purely mechanical text comparison — no external data is invented.
   * @returns [{bookId, hadith, score}] best first
   */
  function similarHadith(bookId, number, limit) {
    const got = getHadith(bookId, number);
    if (!got) return [];
    const A = tokensOf(got.hadith);
    if (A.size < 4) return [];
    const out = [];
    for (const ed of memory.values()) {
      if (ed._lang !== 'eng') continue; // parallels are compared on the translations
      const bId = ed._bookId;
      for (const h of ed.hadiths) {
        if (bId === bookId && h === got.hadith) continue;
        const B = tokensOf(h);
        let inter = 0;
        for (const t of B) if (A.has(t)) inter++;
        if (inter < 6) continue;
        const score = inter / Math.min(A.size, B.size);
        if (score >= 0.5) out.push({ bookId: bId, hadith: h, score });
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit || 6);
  }

  function loadedBookIds() {
    return Array.from(memory.values()).filter((ed) => ed._lang === 'eng').map((ed) => ed._bookId);
  }

  /** Parse a reference query like "bukhari 5062" / "muslim #1". Returns {bookId, number} or null. */
  function parseReference(query) {
    const q = query.trim().toLowerCase().replace(/[.,;:#]+/g, ' ').replace(/\s+/g, ' ');
    const m = q.match(/^(.*?)\s*(\d+[a-z]?)$/);
    if (!m) return null;
    const namePart = m[1].trim();
    if (!namePart) return null;
    for (const id of Object.keys(BOOK_ALIASES)) {
      if (BOOK_ALIASES[id].some((a) => a === namePart)) {
        return { bookId: id, number: m[2] };
      }
    }
    return null;
  }

  function sunnahComUrl(bookId, number) {
    const b = bookById(bookId);
    if (!b || !b.sunnah) return null;
    return 'https://sunnah.com/' + b.sunnah + ':' + number;
  }

  window.SFData = {
    BOOKS,
    bookById,
    loadEdition,
    isLoaded,
    getEditionSync,
    getHadith,
    loadArabic,
    sectionOf,
    sectionsOf,
    hadithsInSection,
    parseReference,
    sunnahComUrl,
    similarHadith,
    loadedBookIds,
  };
})();
