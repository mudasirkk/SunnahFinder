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
      .replace(/[^a-z0-9؀-ۿ]+/g, ' ') // keep latin, digits, arabic
      .replace(/\s+/g, ' ')
      .trim();
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
          // whole-word matches score higher than substring matches
          const wordHit = (' ' + t + ' ').includes(' ' + term + ' ');
          score += wordHit ? 6 : 2;
          score += Math.min(countOccurrences(t, term) - 1, 3);
          if (idx < 120) score += 1; // matches near the narration head read better
        }
        if (!ok) continue;
        // Mild preference for concise hadith over very long ones, as a tiebreak.
        score += Math.max(0, 3 - t.length / 2000);
        results.push({ bookId: ed._bookId, hadith: h, score });
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
    const needles = phrases.concat(terms).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!needles.length) return [];
    const lower = normalize(text);
    // Map normalized offsets back to original offsets by normalizing char-by-char.
    // Simpler robust approach: run regex over the original text with a loose pattern.
    const ranges = [];
    for (const n of needles) {
      const pattern = n
        .split(' ')
        .map((w) => w.split('').map((ch) => escapeRegex(ch)).join("['’‘`´\\u0300-\\u036f]*"))
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
