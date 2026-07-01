/* SunnahFinder UI: hash router + views. No frameworks, no build step. */
(function () {
  'use strict';

  const D = window.SFData;
  const S = window.SFSearch;
  const app = document.getElementById('app');
  const esc = S.escapeHtml;

  const RESULT_LIMIT = 80;
  const DEFAULT_SCOPE = ['bukhari', 'muslim'];

  /* ---------- persisted state ---------- */

  function getScope() {
    try {
      const raw = JSON.parse(localStorage.getItem('sf-scope') || 'null');
      if (Array.isArray(raw)) {
        const valid = raw.filter((id) => D.bookById(id));
        if (valid.length) return valid;
      }
    } catch (e) { /* fall through */ }
    return DEFAULT_SCOPE.slice();
  }

  function setScope(ids) {
    localStorage.setItem('sf-scope', JSON.stringify(ids));
  }

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme; // 'dark' | 'light'
  }

  function initTheme() {
    const saved = localStorage.getItem('sf-theme');
    const preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || preferred);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('sf-theme', next);
      applyTheme(next);
    });
  }

  /* ---------- routing ---------- */

  function parseRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = hash.split('?');
    const params = new URLSearchParams(queryPart || '');
    const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    if (segs.length === 0) return { view: 'home' };
    if (segs[0] === 'search') return { view: 'search', q: params.get('q') || '', in: (params.get('in') || '').split(',').filter(Boolean) };
    if (segs[0] === 'b' && segs.length >= 2) {
      const bookId = segs[1];
      if (!D.bookById(bookId)) return { view: 'home' };
      if (segs.length === 2) return { view: 'book', bookId };
      if (segs[2] === 's' && segs[3]) return { view: 'section', bookId, section: segs[3] };
      return { view: 'hadith', bookId, number: segs[2] };
    }
    return { view: 'home' };
  }

  function href(route) {
    switch (route.view) {
      case 'search': {
        const p = new URLSearchParams();
        p.set('q', route.q);
        if (route.in && route.in.length) p.set('in', route.in.join(','));
        return '#/search?' + p.toString();
      }
      case 'book': return '#/b/' + route.bookId;
      case 'section': return '#/b/' + route.bookId + '/s/' + route.section;
      case 'hadith': return '#/b/' + route.bookId + '/' + route.number;
      default: return '#/';
    }
  }

  /* ---------- shared components ---------- */

  function searchBarHtml(value, big) {
    return (
      '<form id="search-form" class="search-form' + (big ? ' search-form-big' : '') + '" role="search">' +
        '<input id="search-input" type="search" autocomplete="off" spellcheck="false" ' +
          'placeholder="Search text (e.g. intentions) or reference (e.g. bukhari 5062)…" ' +
          'value="' + esc(value || '') + '" aria-label="Search hadith">' +
        '<button type="submit" class="search-btn">Search</button>' +
      '</form>' +
      '<p class="search-hint">Tip: use <code>&quot;quotes&quot;</code> for exact phrases · type a collection + number to jump straight to it · press <kbd>/</kbd> to focus</p>'
    );
  }

  function scopeChipsHtml(scope) {
    const chips = D.BOOKS.map((b) => {
      const on = scope.includes(b.id);
      const loaded = D.isLoaded(b.id);
      return (
        '<button type="button" class="chip' + (on ? ' chip-on' : '') + '" data-book="' + b.id + '" ' +
          'title="' + esc(b.name) + (loaded ? ' (downloaded)' : ' (~' + b.approxMB + ' MB one-time download)') + '">' +
          esc(b.short) + (loaded ? ' <span class="chip-check">✓</span>' : '') +
        '</button>'
      );
    }).join('');
    return (
      '<div class="scope">' +
        '<span class="scope-label">Search in:</span>' +
        '<div class="scope-chips">' + chips + '</div>' +
        '<button type="button" class="chip chip-ghost" id="scope-all">All</button>' +
      '</div>'
    );
  }

  function bindSearchControls(scope, currentQuery) {
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      const ref = D.parseReference(q);
      if (ref) {
        location.hash = href({ view: 'hadith', bookId: ref.bookId, number: ref.number });
      } else {
        location.hash = href({ view: 'search', q, in: getScope() });
      }
    });
    document.querySelectorAll('.chip[data-book]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.book;
        let next = getScope();
        if (next.includes(id)) next = next.filter((x) => x !== id);
        else next.push(id);
        if (!next.length) next = [id]; // never allow an empty scope
        setScope(next);
        if (currentQuery) {
          location.hash = href({ view: 'search', q: currentQuery, in: next });
        } else {
          render(); // just refresh chip states
        }
      });
    });
    const all = document.getElementById('scope-all');
    if (all) {
      all.addEventListener('click', () => {
        setScope(D.BOOKS.map((b) => b.id));
        if (currentQuery) location.hash = href({ view: 'search', q: currentQuery, in: getScope() });
        else render();
      });
    }
    void scope;
  }

  function gradeClass(grade) {
    const g = grade.toLowerCase();
    if (/maudu|fabricat|munkar|batil/.test(g)) return 'grade-bad';
    if (/da'?if|daif|weak|shadh/.test(g)) return 'grade-weak';
    if (/hasan/.test(g)) return 'grade-ok';
    if (/sahih|saheeh|authentic/.test(g)) return 'grade-good';
    return 'grade-neutral';
  }

  function gradesHtml(bookId, hadith) {
    const grades = hadith.grades || [];
    if (!grades.length) {
      if (bookId === 'bukhari' || bookId === 'muslim') {
        return '<span class="grade grade-good" title="Hadith in the two Sahih collections are considered authentic">Sahih</span>';
      }
      return '';
    }
    return grades.map((g) =>
      '<span class="grade ' + gradeClass(String(g.grade)) + '" title="Graded by ' + esc(g.name) + '">' +
        esc(g.grade) + ' <small>· ' + esc(g.name) + '</small></span>'
    ).join(' ');
  }

  function refLabel(bookId, hadith) {
    return esc(D.bookById(bookId).name) + ' ' + esc(String(hadith.hadithnumber));
  }

  /* Loading panel while editions download. */
  function loadingHtml(ids) {
    const rows = ids.map((id) => {
      const b = D.bookById(id);
      const done = D.isLoaded(id);
      return '<li data-load="' + id + '" class="' + (done ? 'done' : '') + '">' +
        esc(b.name) + ' <span class="load-state">' + (done ? '✓' : '~' + b.approxMB + ' MB…') + '</span></li>';
    }).join('');
    return (
      '<div class="loading-panel">' +
        '<div class="spinner" aria-hidden="true"></div>' +
        '<p>Downloading collections (one-time; cached for future visits):</p>' +
        '<ul class="load-list">' + rows + '</ul>' +
      '</div>'
    );
  }

  function ensureLoaded(ids) {
    return Promise.all(ids.map((id) =>
      D.loadEdition(id).then(() => {
        const li = document.querySelector('[data-load="' + id + '"]');
        if (li) {
          li.classList.add('done');
          const st = li.querySelector('.load-state');
          if (st) st.textContent = '✓';
        }
      })
    ));
  }

  /* ---------- views ---------- */

  function renderHome() {
    const scope = getScope();
    const books = D.BOOKS.map((b) =>
      '<a class="book-card" href="#/b/' + b.id + '">' +
        '<span class="book-card-name">' + esc(b.name) + '</span>' +
        '<span class="book-card-sub">Browse chapters →</span>' +
      '</a>'
    ).join('');
    app.innerHTML =
      '<section class="hero">' +
        '<h1>Find a hadith in seconds.</h1>' +
        '<p class="tagline">Full-text search and instant reference lookup across the major collections — no accounts, no clutter.</p>' +
        searchBarHtml('', true) +
        '<div class="examples">Try: ' +
          '<a href="#/search?q=intentions">intentions</a>' +
          '<a href="#/search?q=%22best+among+you%22">"best among you"</a>' +
          '<a href="#/b/bukhari/5062">bukhari 5062</a>' +
          '<a href="#/search?q=kindness+to+parents">kindness to parents</a>' +
        '</div>' +
        scopeChipsHtml(scope) +
      '</section>' +
      '<section class="books"><h2>Browse collections</h2><div class="book-grid">' + books + '</div></section>';
    bindSearchControls(scope, '');
    document.getElementById('search-input').focus();
  }

  function renderSearch(route) {
    const q = route.q;
    if (route.in && route.in.length) setScope(route.in.filter((id) => D.bookById(id)));
    const scope = getScope();
    app.innerHTML =
      '<section class="search-page">' +
        searchBarHtml(q, false) +
        scopeChipsHtml(scope) +
        '<div id="results">' + loadingHtml(scope.filter((id) => !D.isLoaded(id))) + '</div>' +
      '</section>';
    bindSearchControls(scope, q);

    ensureLoaded(scope).then(() => {
      // The user may have navigated away while editions were downloading.
      const now = parseRoute();
      if (now.view !== 'search' || now.q !== q) return;
      const eds = scope.map((id) => D.getEditionSync(id)).filter(Boolean);
      const results = S.search(eds, q, RESULT_LIMIT);
      renderResults(q, results, scope);
    }).catch((e) => {
      const el = document.getElementById('results');
      if (el) el.innerHTML = '<p class="error">Could not download the collections (' + esc(e.message) + '). Check your connection and try again.</p>';
    });
  }

  function renderResults(q, results, scope) {
    const el = document.getElementById('results');
    if (!el) return;
    if (!results.length) {
      el.innerHTML =
        '<p class="no-results">No matches for <b>' + esc(q) + '</b> in the selected collections.</p>' +
        '<ul class="no-results-tips">' +
          '<li>Try fewer or more general words (search uses AND: every word must appear).</li>' +
          '<li>Add more collections above.</li>' +
          '<li>Looking for a specific hadith? Type e.g. <code>muslim 2564</code>.</li>' +
        '</ul>';
      return;
    }
    const items = results.map((r) => {
      const b = D.bookById(r.bookId);
      const link = href({ view: 'hadith', bookId: r.bookId, number: String(r.hadith.hadithnumber) });
      return (
        '<article class="result">' +
          '<header class="result-head">' +
            '<a class="result-ref" href="' + link + '">' + esc(b.name) + ' ' + esc(String(r.hadith.hadithnumber)) + '</a>' +
            '<span class="result-grades">' + gradesHtml(r.bookId, r.hadith) + '</span>' +
          '</header>' +
          '<p class="result-text"><a class="quiet-link" href="' + link + '">' + S.highlight(r.hadith.text, q, 420) + '</a></p>' +
        '</article>'
      );
    }).join('');
    el.innerHTML =
      '<p class="result-count">' + results.length + (results.length === RESULT_LIMIT ? '+' : '') +
      ' result' + (results.length === 1 ? '' : 's') + ' for <b>' + esc(q) + '</b> in ' +
      scope.map((id) => esc(D.bookById(id).short)).join(', ') + '</p>' + items;
  }

  function renderBook(route) {
    const b = D.bookById(route.bookId);
    app.innerHTML =
      '<section class="book-page">' +
        '<nav class="crumbs"><a href="#/">Home</a> › ' + esc(b.name) + '</nav>' +
        '<h1>' + esc(b.name) + '</h1>' +
        '<div id="book-body">' + loadingHtml(D.isLoaded(b.id) ? [] : [b.id]) + '</div>' +
      '</section>';
    ensureLoaded([b.id]).then(() => {
      const el = document.getElementById('book-body');
      if (!el) return;
      const ed = D.getEditionSync(b.id);
      const secs = D.sectionsOf(ed);
      if (secs.length <= 1) {
        // Collections without real chapters (e.g. the forty-hadith sets): list all.
        el.innerHTML = hadithListHtml(b.id, ed.hadiths);
        return;
      }
      el.innerHTML = '<ol class="section-list">' + secs.map((s) =>
        '<li><a href="' + href({ view: 'section', bookId: b.id, section: s.number }) + '">' +
          '<span class="sec-num">' + esc(s.number) + '</span> ' + esc(s.name) +
          '<span class="sec-range">' + esc(String(s.first)) + '–' + esc(String(s.last)) + '</span></a></li>'
      ).join('') + '</ol>';
    }).catch(errInto('book-body'));
  }

  function renderSection(route) {
    const b = D.bookById(route.bookId);
    app.innerHTML =
      '<section class="book-page">' +
        '<nav class="crumbs"><a href="#/">Home</a> › <a href="#/b/' + b.id + '">' + esc(b.name) + '</a> › Chapter ' + esc(route.section) + '</nav>' +
        '<div id="section-body">' + loadingHtml(D.isLoaded(b.id) ? [] : [b.id]) + '</div>' +
      '</section>';
    ensureLoaded([b.id]).then(() => {
      const el = document.getElementById('section-body');
      if (!el) return;
      const ed = D.getEditionSync(b.id);
      const name = (ed.metadata.sections || {})[route.section] || ('Chapter ' + route.section);
      const hs = D.hadithsInSection(ed, route.section);
      el.innerHTML = '<h1 class="section-title">' + esc(route.section) + '. ' + esc(name) + '</h1>' +
        (hs.length ? hadithListHtml(b.id, hs) : '<p class="no-results">No hadith recorded in this chapter.</p>');
    }).catch(errInto('section-body'));
  }

  function hadithListHtml(bookId, hadiths) {
    return hadiths.map((h) => {
      const link = href({ view: 'hadith', bookId, number: String(h.hadithnumber) });
      const text = h.text.length > 320 ? h.text.slice(0, 320) + '…' : h.text;
      return (
        '<article class="result">' +
          '<header class="result-head">' +
            '<a class="result-ref" href="' + link + '">' + refLabel(bookId, h) + '</a>' +
            '<span class="result-grades">' + gradesHtml(bookId, h) + '</span>' +
          '</header>' +
          '<p class="result-text"><a class="quiet-link" href="' + link + '">' + esc(text) + '</a></p>' +
        '</article>'
      );
    }).join('');
  }

  function renderHadith(route) {
    const b = D.bookById(route.bookId);
    app.innerHTML =
      '<section class="detail-page">' +
        '<nav class="crumbs"><a href="#/">Home</a> › <a href="#/b/' + b.id + '">' + esc(b.name) + '</a> › ' + esc(route.number) + '</nav>' +
        '<div id="detail-body">' + loadingHtml(D.isLoaded(b.id) ? [] : [b.id]) + '</div>' +
      '</section>';
    ensureLoaded([b.id]).then(() => {
      const el = document.getElementById('detail-body');
      if (!el) return;
      const got = D.getHadith(b.id, route.number);
      if (!got) {
        el.innerHTML = '<p class="error">No hadith numbered <b>' + esc(route.number) + '</b> in ' + esc(b.name) + '.</p>';
        return;
      }
      const { hadith, index, edition } = got;
      const sec = D.sectionOf(edition, hadith.hadithnumber);
      const prev = index > 0 ? edition.hadiths[index - 1] : null;
      const next = index < edition.hadiths.length - 1 ? edition.hadiths[index + 1] : null;
      const sunnahUrl = D.sunnahComUrl(b.id, hadith.hadithnumber);

      el.innerHTML =
        '<article class="hadith-card">' +
          '<header>' +
            '<h1>' + refLabel(b.id, hadith) + '</h1>' +
            (sec ? '<p class="hadith-section"><a href="' + href({ view: 'section', bookId: b.id, section: sec.number }) + '">Chapter ' + esc(sec.number) + ': ' + esc(sec.name) + '</a></p>' : '') +
            '<p class="hadith-grades">' + gradesHtml(b.id, hadith) + '</p>' +
          '</header>' +
          '<div class="hadith-arabic" id="arabic-slot" dir="rtl" lang="ar"><span class="muted">Loading Arabic…</span></div>' +
          '<div class="hadith-english" lang="en">' + esc(hadith.text) + '</div>' +
          '<footer class="hadith-actions">' +
            '<button type="button" class="action-btn" id="copy-text">Copy text</button>' +
            '<button type="button" class="action-btn" id="copy-link">Copy link</button>' +
            (sunnahUrl ? '<a class="action-btn" target="_blank" rel="noopener" href="' + sunnahUrl + '">View on sunnah.com ↗</a>' : '') +
          '</footer>' +
          '<nav class="pager">' +
            (prev ? '<a href="' + href({ view: 'hadith', bookId: b.id, number: String(prev.hadithnumber) }) + '">← ' + esc(String(prev.hadithnumber)) + '</a>' : '<span></span>') +
            (next ? '<a href="' + href({ view: 'hadith', bookId: b.id, number: String(next.hadithnumber) }) + '">' + esc(String(next.hadithnumber)) + ' →</a>' : '<span></span>') +
          '</nav>' +
        '</article>';

      document.getElementById('copy-text').addEventListener('click', function () {
        copy(D.bookById(b.id).name + ' ' + hadith.hadithnumber + '\n\n' + hadith.text, this);
      });
      document.getElementById('copy-link').addEventListener('click', function () {
        copy(location.href, this);
      });

      D.loadArabic(b.id, hadith.hadithnumber).then((ar) => {
        const slot = document.getElementById('arabic-slot');
        if (slot) slot.innerHTML = ar ? esc(ar) : '';
        if (slot && !ar) slot.style.display = 'none';
      }).catch(() => {
        const slot = document.getElementById('arabic-slot');
        if (slot) slot.style.display = 'none';
      });
    }).catch(errInto('detail-body'));
  }

  function copy(text, btn) {
    const done = () => {
      const old = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* best effort */ }
      document.body.removeChild(ta);
      done();
    }
  }

  function errInto(id) {
    return (e) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<p class="error">Failed to load (' + esc(e.message) + '). Check your connection and try again.</p>';
    };
  }

  /* ---------- boot ---------- */

  function render() {
    const route = parseRoute();
    window.scrollTo(0, 0);
    switch (route.view) {
      case 'search': renderSearch(route); break;
      case 'book': renderBook(route); break;
      case 'section': renderSection(route); break;
      case 'hadith': renderHadith(route); break;
      default: renderHome();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      const input = document.getElementById('search-input');
      if (input) { e.preventDefault(); input.focus(); input.select(); }
    }
  });

  window.addEventListener('hashchange', render);
  initTheme();
  render();
})();
