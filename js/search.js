/* SunnahFinder search engine: small, dependency-free full-text search
 * with AND semantics, phrase support ("exact phrase"), ranking and
 * snippet/highlight generation.
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
      .replace(/[ً-ٰٟـ]/g, '') // Arabic harakat + tatweel
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

  /** All the strings a Latin query term should match: itself, its
   * de-doubled-vowel form (salaah -> salah), and equivalence-group members. */
  function expandTerm(term) {
    const out = new Set([term]);
    const folded = term.replace(/([aeiou])\1+/g, '$1');
    out.add(folded);
    for (const t of [term, folded]) {
      const g = EQUIV.get(t);
      if (g) for (const w of g) out.add(w);
    }
    return Array.from(out);
  }

  /** Split a raw query into { phrases: [...], terms: [...] } (all normalized). */
  function parseQuery(raw) {
    const phrases = [];
    let rest = String(raw);
    rest = rest.replace(/"([^"]+)"/g, (_, p) => {
      const n = normalize(p);
      if (n) phrases.push(n);
      return ' ';
    });
    const terms = normalize(rest).split(' ').filter((t) => t.length > 1 || /[؀-ۿ0-9]/.test(t));
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
   * Search preloaded editions.
   * @param editions array of edition objects (with _norm precomputed by SFData)
   * @param rawQuery user query string
   * @param limit max results
   * @returns [{bookId, hadith, score}] sorted by score desc
   */
  function search(editions, rawQuery, limit) {
    const { phrases, terms } = parseQuery(rawQuery);
    if (!phrases.length && !terms.length) return [];
    const results = [];
    for (const ed of editions) {
      // Match Arabic query parts against Arabic editions and Latin parts
      // against English ones; a mixed query uses each part where it applies.
      const isAr = ed._lang === 'ara';
      const edPhrases = phrases.filter((p) => ARABIC_RE.test(p) === isAr);
      const edTerms = terms.filter((t) => ARABIC_RE.test(t) === isAr);
      if (!edPhrases.length && !edTerms.length) continue;
      const needleSets = edTerms.map((t) => (isAr ? [t] : expandTerm(t)));

      for (const h of ed.hadiths) {
        const t = h._norm;
        if (!t) continue;
        let score = 0;
        let ok = true;
        for (const p of edPhrases) {
          const c = countOccurrences(t, p);
          if (!c) { ok = false; break; }
          score += 12 * c;
        }
        if (!ok) continue;
        for (const needles of needleSets) {
          let best = 0;
          for (const needle of needles) {
            const idx = t.indexOf(needle);
            if (idx === -1) continue;
            // whole-word matches score higher than substring matches
            const wordHit = (' ' + t + ' ').includes(' ' + needle + ' ');
            let s = wordHit ? 6 : 2;
            s += Math.min(countOccurrences(t, needle) - 1, 3);
            if (idx < 120) s += 1; // matches near the narration head read better
            if (s > best) best = s;
          }
          if (!best) { ok = false; break; }
          score += best;
        }
        if (!ok) continue;
        // Mild preference for concise hadith over very long ones, as a tiebreak.
        score += Math.max(0, 3 - t.length / 2000);
        results.push({ bookId: ed._bookId, lang: ed._lang, hadith: h, score });
      }
    }
    results.sort((a, b) => b.score - a.score || Number(a.hadith.hadithnumber) - Number(b.hadith.hadithnumber));
    return results.slice(0, limit || 100);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Ranges of [start, end) in `text` where any term/phrase matches, on normalized-ish boundaries. */
  function matchRanges(text, rawQuery) {
    const { phrases, terms } = parseQuery(rawQuery);
    const expanded = [];
    for (const t of terms) {
      for (const n of (ARABIC_RE.test(t) ? [t] : expandTerm(t))) expanded.push(n);
    }
    const needles = phrases.concat(expanded).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!needles.length) return [];
    const lower = normalize(text);
    // Map normalized offsets back to original offsets by normalizing char-by-char.
    // Simpler robust approach: run regex over the original text with a loose pattern.
    const ranges = [];
    for (const n of needles) {
      // Between characters, tolerate apostrophes, Latin accents and Arabic
      // harakat/tatweel; folded Arabic letters match all their original forms,
      // so highlights land on the original (diacritized) text.
      const AR_FOLD = { 'ا': '[اأإآٱ]', 'ي': '[يىئ]', 'ه': '[هة]', 'و': '[وؤ]' };
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
        if (ranges.length > 200) break;
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    // merge overlaps
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    void lower;
    return merged;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** HTML for `text` with <mark> around matches; optionally trimmed to a snippet. */
  function highlight(text, rawQuery, snippetLen) {
    const ranges = matchRanges(text, rawQuery);
    let start = 0;
    let end = text.length;
    if (snippetLen && text.length > snippetLen) {
      const focus = ranges.length ? ranges[0][0] : 0;
      start = Math.max(0, focus - Math.floor(snippetLen / 4));
      // snap to a word boundary
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

  window.SFSearch = { normalize, parseQuery, search, highlight, escapeHtml };
})();
