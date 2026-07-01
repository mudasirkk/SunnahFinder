/* SunnahFinder search engine: small, dependency-free full-text search.
 *
 * Matching rules:
 * - Function words ("to", "of", "the"…) in the query are ignored, so
 *   "kindness to parents" searches for kindness + parents.
 * - Latin terms match WHOLE words only, compared by a light stem, so
 *   "kindness" matches "kind"/"kindly" and "parents" matches "parent",
 *   but "to" never matches the middle of another word.
 * - Common transliteration variants and their translation equivalents are
 *   expanded at query time (salah/salat/prayer, wudu/ablution, …).
 * - Arabic terms match by substring (Arabic attaches articles and
 *   prepositions to the word: بالنيات contains النيات).
 * - "quoted phrases" must appear verbatim (after normalization).
 * - If fewer than a handful of hadith contain every word, near misses that
 *   lack one word are appended, flagged `partial` so the UI can label them.
 */
(function () {
  'use strict';

  /** Lowercase, strip accents/diacritics/ﷺ/punctuation so queries match loosely. */
  function normalize(text) {
    return String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')          // latin accents
      .replace(/[ﷰ-﷿]/g, ' ')         // ﷺ and other Arabic ligatures
      .replace(/[ً-ٰٟـ]/g, '') // Arabic harakat + tatweel
      .replace(/[،؛؟٪٫٬٭۔]/g, ' ') // Arabic punctuation
      .replace(/['’‘`´]/g, '')   // apostrophes: nasa'i -> nasai
      .replace(/ة/g, 'ه')        // ta marbuta -> ha
      .replace(/ى/g, 'ي')        // alif maqsura -> ya
      .replace(/[^a-z0-9؀-ۿ]+/g, ' ') // keep latin, digits, arabic
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Note: NFD + the harakat strip above also folds hamza carriers (أ إ آ ؤ ئ)
  // to their base letters, so queries match regardless of hamza/diacritics.

  const ARABIC_RE = /[؀-ۿ]/;

  /* English function words carry no topic, so they are dropped from queries
   * (quoted phrases keep them). */
  const FUNCTION_WORDS = new Set(('a an and the to of in on at for with from by is are was were be been being am ' +
    'it its he she they them him his her hers their theirs you your yours we us our ours i me my mine who whom whose ' +
    'that this these those or as but if not no nor so than then too very just also only own same such there here ' +
    'when where which what while each all any some do does did done has have had will would shall should can could may might').split(' '));

  /** Very light stemmer; applied identically to indexed words and query
   * terms, so both sides land on the same key. */
  function stem(w) {
    if (w.length <= 3 || ARABIC_RE.test(w)) return w;
    if (w.length > 5 && w.endsWith('ness')) w = w.slice(0, -4);   // kindness -> kind
    else if (w.length > 5 && w.endsWith('ful')) w = w.slice(0, -3); // merciful -> merci
    if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);    // fasting -> fast
    else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2); // treated -> treat
    else if (w.length > 4 && w.endsWith('ly')) w = w.slice(0, -2); // kindly -> kind
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); // parents -> parent
    if (w.length > 3) w = w.replace(/y$/, 'i').replace(/e$/, ''); // mercy -> merci, house(s) -> hous
    return w;
  }

  /* Transliteration equivalences, applied at query time only (never to the
   * displayed texts): common Latin spellings of the same Arabic word, plus
   * the word the English translations typically use. A query for any member
   * of a group also matches the others. */
  const EQUIV_GROUPS = [
    ['salah', 'salat', 'salaat', 'salaah', 'prayer'],
    ['wudu', 'wudhu', 'wuzu', 'ablution'],
    ['ghusl', 'ghusul'],
    ['sawm', 'siyam', 'fasting'],
    ['zakat', 'zakah', 'zakaat'],
    ['sadaqah', 'sadaqa', 'charity', 'alms'],
    ['hajj', 'pilgrimage'],
    ['umrah', 'umra'],
    ['dua', 'duaa', 'supplication', 'invocation'],
    ['dhikr', 'zikr', 'remembrance'],
    ['quran', 'koran', 'quraan'],
    ['masjid', 'mosque'],
    ['jumuah', 'jumah', 'friday'],
    ['jannah', 'jannat', 'paradise'],
    ['jahannam', 'hellfire'],
    ['shaytan', 'shaitan', 'satan', 'devil'],
    ['iman', 'eman', 'faith'],
    ['kufr', 'disbelief'],
    ['nikah', 'marriage'],
    ['talaq', 'divorce'],
    ['riba', 'usury'],
    ['halal', 'lawful', 'permissible'],
    ['haram', 'unlawful', 'forbidden'],
    ['rasul', 'rasool', 'messenger'],
    ['nabi', 'prophet'],
    ['sahaba', 'companions'],
    ['ramadan', 'ramadhan', 'ramazan'],
    ['kaba', 'kaaba'],
    ['qibla', 'qiblah'],
    ['miswak', 'siwak'],
    ['sunnah', 'sunna'],
    ['hadith', 'hadeeth'],
    ['deen', 'religion'],
    ['dunya', 'duniya'],
    ['akhirah', 'hereafter'],
    ['tawbah', 'tauba', 'repentance'],
    ['sabr', 'patience'],
    ['taqwa', 'piety'],
    ['jihad', 'jihaad'],
    ['ilm', 'knowledge'],
    ['salam', 'salaam'],
    ['janazah', 'funeral'],
    ['suhur', 'sahur', 'sahoor'],
    ['khutbah', 'khutba', 'sermon'],
    ['imam', 'imaam'],
    ['adhan', 'azan', 'athan'],
    ['iqamah', 'iqama'],
    ['qadr', 'decree'],
    ['barakah', 'baraka', 'blessing'],
    ['shirk', 'polytheism'],
    ['tawhid', 'tawheed', 'tauheed', 'monotheism'],
    ['aqiqah', 'aqiqa', 'aqeeqah'],
    ['mahr', 'dowry'],
    ['khamr', 'wine'],
    ['zuhr', 'dhuhr', 'duhr', 'zohr'],
    ['fajr', 'dawn'],
    ['maghrib', 'sunset'],
    ['isha', 'ishaa'],
    ['witr', 'vitr'],
    ['tahajjud'],
    ['laylatul', 'laylat'],
  ];
  const EQUIV = new Map();
  for (const g of EQUIV_GROUPS) for (const w of g) EQUIV.set(w, g);

  /**
   * Everything a Latin query term should match:
   * raw: literal forms (for ranking bonuses and phrase-ish position checks)
   * stems: stemmed keys used for whole-word matching against the index
   */
  function expandTerm(term) {
    const raw = new Set([term]);
    const folded = term.replace(/([aeiou])\1+/g, '$1'); // salaah -> salah
    raw.add(folded);
    for (const t of [term, folded]) {
      const g = EQUIV.get(t);
      if (g) for (const w of g) raw.add(w);
    }
    const stems = new Set();
    for (const r of raw) stems.add(stem(r));
    return { raw: Array.from(raw), stems: Array.from(stems) };
  }

  /** Split a raw query into { phrases: [...], terms: [...] } (all normalized,
   * function words dropped from terms unless nothing else remains). */
  function parseQuery(raw) {
    const phrases = [];
    let rest = String(raw);
    rest = rest.replace(/"([^"]+)"/g, (_, p) => {
      const n = normalize(p);
      if (n) phrases.push(n);
      return ' ';
    });
    const allTerms = normalize(rest).split(' ').filter((t) => t.length > 1 || /[؀-ۿ0-9]/.test(t));
    let terms = allTerms.filter((t) => ARABIC_RE.test(t) || !FUNCTION_WORDS.has(t));
    if (!terms.length) terms = allTerms;
    return { phrases, terms };
  }

  function countOccurrences(haystack, needle) {
    let count = 0;
    let pos = haystack.indexOf(needle);
    while (pos !== -1) {
      count++;
      pos = haystack.indexOf(needle, pos + needle.length);
    }
    return count;
  }

  /**
   * Search preloaded editions (indexed by SFData: _norm, _postings, _lang).
   * @returns [{bookId, lang, hadith, score, partial?}] sorted best-first,
   * exact (all-words) results before `partial` (all-but-one-word) ones.
   */
  function search(editions, rawQuery, limit) {
    const { phrases, terms } = parseQuery(rawQuery);
    if (!phrases.length && !terms.length) return [];
    const results = [];
    const engJobs = [];

    for (const ed of editions) {
      // Match Arabic query parts against Arabic editions and Latin parts
      // against English ones; a mixed query uses each part where it applies.
      const isAr = ed._lang === 'ara';
      const edPhrases = phrases.filter((p) => ARABIC_RE.test(p) === isAr);
      const edTerms = terms.filter((t) => ARABIC_RE.test(t) === isAr);
      if (!edPhrases.length && !edTerms.length) continue;
      if (isAr) {
        searchArabic(ed, edPhrases, edTerms, results);
      } else {
        engJobs.push(searchEnglish(ed, edPhrases, edTerms, results));
      }
    }

    // Near misses: only when strict matching found little to show.
    const strictCount = results.length;
    if (strictCount < 5) {
      for (const job of engJobs) addPartialMatches(job, results);
    }

    results.sort((a, b) =>
      (a.partial ? 1 : 0) - (b.partial ? 1 : 0) ||
      b.score - a.score ||
      Number(a.hadith.hadithnumber) - Number(b.hadith.hadithnumber));
    return results.slice(0, limit || 100);
  }

  /* Arabic: substring matching (prefixes attach to words), no expansion. */
  function searchArabic(ed, phrases, terms, out) {
    for (const h of ed.hadiths) {
      const t = h._norm;
      if (!t) continue;
      let score = 0;
      let ok = true;
      for (const p of phrases) {
        const c = countOccurrences(t, p);
        if (!c) { ok = false; break; }
        score += 12 * c;
      }
      if (!ok) continue;
      for (const term of terms) {
        const idx = t.indexOf(term);
        if (idx === -1) { ok = false; break; }
        const wordHit = (' ' + t + ' ').includes(' ' + term + ' ');
        score += wordHit ? 6 : 4;
        score += Math.min(countOccurrences(t, term) - 1, 3);
        if (idx < 120) score += 1;
      }
      if (!ok) continue;
      score += Math.max(0, 3 - t.length / 2000);
      out.push({ bookId: ed._bookId, lang: ed._lang, hadith: h, score });
    }
  }

  /* English: whole-word matching through the stemmed postings index. */
  function searchEnglish(ed, phrases, terms, out) {
    const expansions = terms.map(expandTerm);
    // Per-term candidate sets: hadith indexes containing that term (any stem).
    const candSets = expansions.map((x) => {
      const s = new Set();
      for (const st of x.stems) {
        const arr = ed._postings.get(st);
        if (arr) for (const i of arr) s.add(i);
      }
      return s;
    });

    const strict = new Set();
    if (terms.length) {
      // Intersect, starting from the smallest set.
      const sorted = candSets.slice().sort((a, b) => a.size - b.size);
      outer: for (const i of sorted[0]) {
        for (let k = 1; k < sorted.length; k++) if (!sorted[k].has(i)) continue outer;
        strict.add(i);
      }
    } else {
      for (let i = 0; i < ed.hadiths.length; i++) strict.add(i); // phrase-only query
    }

    for (const i of strict) {
      const h = ed.hadiths[i];
      const score = scoreEnglish(h, phrases, expansions, -1);
      if (score >= 0) out.push({ bookId: ed._bookId, lang: ed._lang, hadith: h, score });
    }
    return { ed, phrases, expansions, candSets, strict };
  }

  /** Score a hadith; skipIdx marks the term allowed to be absent (-1: none).
   * Returns -1 when a required phrase is missing. */
  function scoreEnglish(h, phrases, expansions, skipIdx) {
    const t = h._norm;
    let score = 0;
    for (const p of phrases) {
      const c = countOccurrences(t, p);
      if (!c) return -1;
      score += 12 * c;
    }
    const firstIdx = [];
    for (let k = 0; k < expansions.length; k++) {
      if (k === skipIdx) continue;
      let best = 6; // word presence is guaranteed by the index
      let bestIdx = -1;
      for (const needle of expansions[k].raw) {
        const idx = t.indexOf(needle);
        if (idx === -1) continue;
        if (bestIdx === -1 || idx < bestIdx) bestIdx = idx;
        const wordHit = (' ' + t + ' ').includes(' ' + needle + ' ');
        let s = 6 + (wordHit ? 2 : 0) + Math.min(countOccurrences(t, needle) - 1, 2) + (idx < 120 ? 1 : 0);
        if (s > best) best = s;
      }
      score += best;
      if (bestIdx !== -1) firstIdx.push(bestIdx);
      // Topical grounding: the term appears in this hadith's chapter title.
      if (h._secStems) {
        for (const st of expansions[k].stems) {
          if (h._secStems.has(st)) { score += 4; break; }
        }
      }
    }
    // Proximity: terms clustered together read as one topic, not coincidence.
    if (firstIdx.length >= 2 && firstIdx.length === expansions.length - (skipIdx >= 0 ? 1 : 0)) {
      const span = Math.max.apply(null, firstIdx) - Math.min.apply(null, firstIdx);
      if (span < 150) score += 5;
      else if (span < 400) score += 2;
    }
    score += Math.max(0, 3 - t.length / 2000);
    return score;
  }

  /* Hadith matching all terms but one, appended at half score with a flag. */
  function addPartialMatches(job, out) {
    const { ed, phrases, expansions, candSets, strict } = job;
    if (expansions.length < 2) return;
    const seen = new Set();
    for (let skip = 0; skip < candSets.length; skip++) {
      let inter = null;
      for (let k = 0; k < candSets.length; k++) {
        if (k === skip) continue;
        if (inter === null) { inter = new Set(candSets[k]); continue; }
        for (const i of inter) if (!candSets[k].has(i)) inter.delete(i);
      }
      for (const i of inter || []) {
        if (strict.has(i) || seen.has(i)) continue;
        seen.add(i);
        const h = ed.hadiths[i];
        const score = scoreEnglish(h, phrases, expansions, skip);
        if (score >= 0) out.push({ bookId: ed._bookId, lang: ed._lang, hadith: h, score: score * 0.5, partial: true });
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Ranges of [start, end) in `text` where the query matches. Whole words
   * (by stem) for Latin terms; tolerant regexes for phrases/Arabic. */
  function matchRanges(text, rawQuery) {
    const { phrases, terms } = parseQuery(rawQuery);
    const ranges = [];

    // Latin terms: mark whole words whose stem matches the query's stems.
    const stemSet = new Set();
    for (const t of terms) {
      if (ARABIC_RE.test(t)) continue;
      for (const st of expandTerm(t).stems) stemSet.add(st);
    }
    if (stemSet.size) {
      const wordRe = /[a-z0-9À-ɏ'’‘`´]+/gi;
      let m;
      while ((m = wordRe.exec(text)) !== null) {
        const nw = normalize(m[0]);
        if (nw && !nw.includes(' ') && stemSet.has(stem(nw))) {
          ranges.push([m.index, m.index + m[0].length]);
        }
      }
    }

    // Phrases and Arabic terms: character-tolerant regex over the original
    // text (harakat, hamza variants, apostrophes may sit inside matches).
    const needles = phrases.concat(terms.filter((t) => ARABIC_RE.test(t)))
      .filter(Boolean).sort((a, b) => b.length - a.length);
    const AR_FOLD = { 'ا': '[اأإآٱ]', 'ي': '[يىئ]', 'ه': '[هة]', 'و': '[وؤ]' };
    for (const n of needles) {
      const pattern = n
        .split(' ')
        .map((w) => w.split('').map((ch) => AR_FOLD[ch] || escapeRegex(ch)).join("['’‘`´\\u0300-\\u036f\\u064b-\\u065f\\u0670\\u0640]*"))
        .join("[^a-z0-9\\u0600-\\u06ff]+");
      let re;
      try { re = new RegExp(pattern, 'gi'); } catch (e) { continue; }
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        ranges.push([m.index, m.index + m[0].length]);
        if (ranges.length > 300) break;
      }
    }

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    return merged;
  }

  /** HTML for `text` with <mark> around matches; optionally trimmed to a snippet. */
  function highlight(text, rawQuery, snippetLen) {
    const ranges = matchRanges(text, rawQuery);
    let start = 0;
    let end = text.length;
    if (snippetLen && text.length > snippetLen) {
      const focus = ranges.length ? ranges[0][0] : 0;
      start = Math.max(0, focus - Math.floor(snippetLen / 4));
      if (start > 0) {
        const sp = text.indexOf(' ', start);
        if (sp !== -1 && sp < start + 40) start = sp + 1;
      }
      end = Math.min(text.length, start + snippetLen);
    }
    let html = '';
    let cursor = start;
    for (const [a, b] of ranges) {
      if (b <= start || a >= end) continue;
      const from = Math.max(a, start);
      const to = Math.min(b, end);
      if (from > cursor) html += escapeHtml(text.slice(cursor, from));
      html += '<mark>' + escapeHtml(text.slice(from, to)) + '</mark>';
      cursor = to;
    }
    if (cursor < end) html += escapeHtml(text.slice(cursor, end));
    if (start > 0) html = '… ' + html;
    if (end < text.length) html += ' …';
    return html;
  }

  window.SFSearch = { normalize, stem, parseQuery, search, highlight, escapeHtml };
})();
