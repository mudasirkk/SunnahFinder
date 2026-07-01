/* SunnahFinder data layer.
 * Editions come from the open fawazahmed0/hadith-api dataset. Files are
 * immutable (pinned to the @1 tag), so we cache aggressively via the
 * Cache Storage API and fall back between two mirrors.
 */
(function () {
  'use strict';

  const MIRRORS = [
    'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1',
    'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1',
  ];

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
    { id: 'nawawi',   name: 'Forty Hadith of an-Nawawi', short: 'Nawawi 40', approxMB: 0.1, sunnah: 'nawawi40' },
    { id: 'qudsi',    name: 'Forty Hadith Qudsi',      short: 'Qudsi 40',  approxMB: 0.1, sunnah: 'qudsi40' },
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
  };

  const memory = new Map();      // bookId -> edition object (parsed JSON)
  const inflight = new Map();    // bookId -> Promise

  function bookById(id) {
    return BOOKS.find((b) => b.id === id) || null;
  }

  async function cachedFetch(path) {
    const urls = MIRRORS.map((m) => m + path);
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

  /** Load a full English edition (one-time ~1–5 MB, then cached). */
  function loadEdition(bookId) {
    if (memory.has(bookId)) return Promise.resolve(memory.get(bookId));
    if (inflight.has(bookId)) return inflight.get(bookId);
    const p = cachedFetch('/editions/eng-' + bookId + '.min.json')
      .then((ed) => {
        indexEdition(bookId, ed);
        memory.set(bookId, ed);
        inflight.delete(bookId);
        return ed;
      })
      .catch((e) => { inflight.delete(bookId); throw e; });
    inflight.set(bookId, p);
    return p;
  }

  function isLoaded(bookId) {
    return memory.has(bookId);
  }

  /** The already-downloaded edition object, or null if not loaded yet. */
  function getEditionSync(bookId) {
    return memory.get(bookId) || null;
  }

  /* Precompute per-hadith normalized text and a number->index map so
   * searches and lookups are O(1)-ish after the first load. */
  function indexEdition(bookId, ed) {
    const byNumber = new Map();
    for (let i = 0; i < ed.hadiths.length; i++) {
      const h = ed.hadiths[i];
      h._norm = window.SFSearch.normalize(h.text);
      byNumber.set(String(h.hadithnumber), i);
    }
    ed._byNumber = byNumber;
    ed._bookId = bookId;
  }

  function getHadith(bookId, number) {
    const ed = memory.get(bookId);
    if (!ed) return null;
    const idx = ed._byNumber.get(String(number));
    if (idx === undefined) return null;
    return { hadith: ed.hadiths[idx], index: idx, edition: ed };
  }

  /** Fetch the Arabic text of a single hadith (tiny request, also cached). */
  function loadArabic(bookId, number) {
    return cachedFetch('/editions/ara-' + bookId + '/' + number + '.min.json')
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
  };
})();
