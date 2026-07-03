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
      // An explicitly-empty selection ("Clear all") is respected; only a
      // missing/corrupt value falls back to the default.
      if (Array.isArray(raw)) return raw.filter((id) => D.bookById(id));
    } catch (e) { /* fall through */ }
    return DEFAULT_SCOPE.slice();
  }

  function setScope(ids) {
    localStorage.setItem('sf-scope', JSON.stringify(ids));
  }

  /* ---------- settings (theme + fonts) ---------- */

  const ENG_FONTS = {
    system: { label: 'System (default)', css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", gf: null },
    georgia: { label: 'Georgia (serif)', css: "Georgia, 'Times New Roman', serif", gf: null },
    inter: { label: 'Inter', css: "'Inter', -apple-system, 'Segoe UI', sans-serif", gf: 'Inter:wght@400;600;700' },
    lora: { label: 'Lora', css: "'Lora', Georgia, serif", gf: 'Lora:wght@400;600;700' },
    merriweather: { label: 'Merriweather', css: "'Merriweather', Georgia, serif", gf: 'Merriweather:wght@400;700' },
  };
  const ARA_FONTS = {
    naskh: { label: 'Naskh (default)', css: "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Traditional Arabic', serif", gf: null },
    amiri: { label: 'Amiri', css: "'Amiri', 'Traditional Arabic', serif", gf: 'Amiri:wght@400;700' },
    scheherazade: { label: 'Scheherazade New', css: "'Scheherazade New', 'Traditional Arabic', serif", gf: 'Scheherazade+New:wght@400;700' },
    notonaskh: { label: 'Noto Naskh Arabic', css: "'Noto Naskh Arabic', 'Traditional Arabic', serif", gf: 'Noto+Naskh+Arabic:wght@400;700' },
    kufi: { label: 'Noto Kufi Arabic', css: "'Noto Kufi Arabic', sans-serif", gf: 'Noto+Kufi+Arabic:wght@400;700' },
  };

  // Independent reading-text scales for English and Arabic, driven by sliders
  // and applied via the --eng-reading-scale / --ara-reading-scale variables.
  const SCALE = { min: 0.85, max: 1.4, step: 0.05, def: 1 };
  function clampScale(v) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return SCALE.def;
    const snapped = Math.round(n / SCALE.step) * SCALE.step;
    return Math.min(SCALE.max, Math.max(SCALE.min, snapped));
  }

  // Basmala shown in the header and used as the Arabic font/size specimen.
  const BISMILLAH = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

  function getSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('sf-settings') || '{}'); } catch (e) { /* defaults */ }
    return {
      theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',
      engFont: ENG_FONTS[s.engFont] ? s.engFont : 'system',
      araFont: ARA_FONTS[s.araFont] ? s.araFont : 'naskh',
      engScale: clampScale(s.engScale),
      araScale: clampScale(s.araScale),
    };
  }

  function saveSettings(s) {
    localStorage.setItem('sf-settings', JSON.stringify(s));
  }

  function ensureGoogleFont(gf) {
    if (!gf) return;
    const id = 'gf-' + gf.replace(/[^a-z]/gi, '');
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + gf + '&display=swap';
    document.head.appendChild(link); // if blocked/offline, the CSS stacks still apply
  }

  function applySettings() {
    const s = getSettings();
    const dark = s.theme === 'dark' ||
      (s.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    ensureGoogleFont(ENG_FONTS[s.engFont].gf);
    ensureGoogleFont(ARA_FONTS[s.araFont].gf);
    document.documentElement.style.setProperty('--english-font', ENG_FONTS[s.engFont].css);
    document.documentElement.style.setProperty('--arabic-font', ARA_FONTS[s.araFont].css);
    document.documentElement.style.setProperty('--eng-reading-scale', String(s.engScale));
    document.documentElement.style.setProperty('--ara-reading-scale', String(s.araScale));
  }

  /* Shared settings UI — one markup builder used by both the desktop drawer
   * and the mobile settings page, so the two never drift apart. */

  function optionsHtml(entries, cur) {
    return entries.map(([val, label]) =>
      '<option value="' + esc(val) + '"' + (val === cur ? ' selected' : '') + '>' + esc(label) + '</option>'
    ).join('');
  }

  function settingsFormHtml() {
    const s = getSettings();
    const scope = getScope();
    const allOn = D.BOOKS.every((b) => scope.includes(b.id));
    const fontEntries = (fonts) => Object.keys(fonts).map((k) => [k, fonts[k].label]);
    const themeToggle = '<div class="seg" role="group" aria-label="Theme">' +
      [['light', 'Light'], ['auto', 'Auto'], ['dark', 'Dark']].map(([v, l]) =>
        '<button type="button" class="seg-btn' + (v === s.theme ? ' on' : '') + '" data-theme-opt="' + v + '"' +
          ' aria-pressed="' + (v === s.theme) + '">' + l + '</button>').join('') +
      '</div>';
    const sizeSlider = (label, id, val) =>
      '<div class="set-group"><span class="set-legend">' + esc(label) + '</span>' +
        '<div class="size-row">' +
          '<span class="size-a size-a-min" aria-hidden="true">A</span>' +
          '<input type="range" class="size-slider" id="' + id + '" ' +
            'min="' + SCALE.min + '" max="' + SCALE.max + '" step="' + SCALE.step + '" value="' + val + '" ' +
            'aria-label="' + esc(label) + '">' +
          '<span class="size-a size-a-max" aria-hidden="true">A</span>' +
        '</div></div>';
    const books = D.BOOKS.map((b) =>
      '<label class="set-book"><input type="checkbox" data-book="' + b.id + '"' +
        (scope.includes(b.id) ? ' checked' : '') + '>' +
        '<span>' + esc(b.short) + (b.araOnly ? ' <span class="muted">· Arabic</span>' : '') + '</span></label>'
    ).join('');
    return (
      '<div class="settings-form">' +
        '<div class="set-group"><span class="set-legend">Theme</span>' + themeToggle + '</div>' +
        '<label class="set-group"><span class="set-legend">English font</span>' +
          '<select id="set-eng-font">' + optionsHtml(fontEntries(ENG_FONTS), s.engFont) + '</select></label>' +
        '<label class="set-group"><span class="set-legend">Arabic font</span>' +
          '<select id="set-ara-font">' + optionsHtml(fontEntries(ARA_FONTS), s.araFont) + '</select></label>' +
        sizeSlider('English text size', 'set-eng-size', s.engScale) +
        sizeSlider('Arabic text size', 'set-ara-size', s.araScale) +
        '<div class="set-group"><span class="set-legend">Preview</span>' +
          '<div class="settings-preview" aria-hidden="true">' +
            '<p class="preview-ara" dir="rtl" lang="ar">' + esc(BISMILLAH) + '</p>' +
            '<p class="preview-eng">This is how translations appear at your chosen font and size.</p>' +
          '</div></div>' +
        '<div class="set-group set-books"><span class="set-legend">Collections to search</span>' +
          '<p class="settings-note">New searches start with these. You can still change them for any single search.</p>' +
          '<div class="set-book-list">' + books + '</div>' +
          '<button type="button" class="linklike" id="set-books-all">' + (allOn ? 'Clear all' : 'Select all') + '</button>' +
        '</div>' +
        '<p class="settings-note">“Copy for Docs” embeds your chosen fonts in the pasted text.</p>' +
      '</div>'
    );
  }

  /* Wire a rendered settings form. All lookups are scoped to `root` so the
   * drawer and the page instances stay independent even if both exist. */
  function bindSettings(root) {
    const engSel = root.querySelector('#set-eng-font');
    const araSel = root.querySelector('#set-ara-font');
    const engSize = root.querySelector('#set-eng-size');
    const araSize = root.querySelector('#set-ara-size');
    const segBtns = Array.prototype.slice.call(root.querySelectorAll('.seg-btn[data-theme-opt]'));
    const currentTheme = () => {
      const on = segBtns.filter((b) => b.classList.contains('on'))[0];
      return on ? on.dataset.themeOpt : 'auto';
    };
    const save = () => {
      saveSettings({
        theme: currentTheme(),
        engFont: engSel.value,
        araFont: araSel.value,
        engScale: parseFloat(engSize.value),
        araScale: parseFloat(araSize.value),
      });
      applySettings();
    };
    [engSel, araSel].forEach((el) => { if (el) el.addEventListener('change', save); });
    // `input` (not `change`) so the preview scales live while dragging.
    [engSize, araSize].forEach((el) => { if (el) el.addEventListener('input', save); });
    segBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        segBtns.forEach((b) => {
          const on = b === btn;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        save();
      });
    });

    const allBtn = root.querySelector('#set-books-all');
    const syncAllBtn = () => {
      if (allBtn) allBtn.textContent = D.BOOKS.every((b) => getScope().includes(b.id)) ? 'Clear all' : 'Select all';
    };
    root.querySelectorAll('.set-book input[data-book]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.book;
        let next = getScope();
        next = cb.checked ? (next.includes(id) ? next : next.concat(id)) : next.filter((x) => x !== id);
        setScope(next);
        syncAllBtn();
      });
    });
    if (allBtn) {
      allBtn.addEventListener('click', () => {
        const allOn = D.BOOKS.every((b) => getScope().includes(b.id));
        setScope(allOn ? [] : D.BOOKS.map((b) => b.id));
        root.querySelectorAll('.set-book input[data-book]').forEach((cb) => { cb.checked = !allOn; });
        syncAllBtn();
      });
    }
  }

  function initSettings() {
    applySettings();
    const btn = document.getElementById('settings-toggle');
    const panel = document.getElementById('settings-panel');
    const backdrop = document.getElementById('settings-backdrop');
    if (!btn || !panel || !backdrop) return;

    const isOpen = () => panel.classList.contains('open');
    function openDrawer() {
      panel.innerHTML =
        '<div class="settings-panel-inner">' +
          '<header class="settings-head"><h2>Settings</h2>' +
            '<button type="button" class="modal-x" id="settings-close" aria-label="Close settings">✕</button></header>' +
          settingsFormHtml() +
        '</div>';
      bindSettings(panel);
      panel.querySelector('#settings-close').addEventListener('click', closeDrawer);
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      backdrop.classList.add('show');
      btn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      backdrop.classList.remove('show');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      setTimeout(() => { if (!isOpen()) panel.innerHTML = ''; }, 300);
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); isOpen() ? closeDrawer() : openDrawer(); });
    backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) closeDrawer(); });
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);
    }
  }

  /* ---------- routing ---------- */

  function parseRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = hash.split('?');
    const params = new URLSearchParams(queryPart || '');
    const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    if (segs.length === 0) return { view: 'home' };
    if (segs[0] === 'browse') return { view: 'browse' };
    if (segs[0] === 'settings') return { view: 'settings' };
    if (segs[0] === 'search') {
      return {
        view: 'search',
        q: params.get('q') || '',
        in: (params.get('in') || '').split(',').filter(Boolean),
        n: params.get('n') || '',
        g: (params.get('g') || '').split(',').filter(Boolean),
      };
    }
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
        if (route.n) p.set('n', route.n);
        if (route.g && route.g.length) p.set('g', route.g.join(','));
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
      '<p class="search-hint">Search in English, Arabic (<span dir="rtl" lang="ar">النية</span>) or transliteration (salah, wudu, zakat) · ' +
      '<code>&quot;quotes&quot;</code> for exact phrases · collection + number (e.g. <code>bukhari 5062</code>) jumps straight there · <kbd>/</kbd> focuses</p>'
    );
  }

  /* ---------- collection scope: compact summary + picker modal ---------- */

  function scopeLabel(scope) {
    const all = D.BOOKS.length;
    if (scope.length >= all) return 'all ' + all + ' collections';
    if (scope.length === 0) return 'no collections';
    if (scope.length <= 2) return scope.map((id) => D.bookById(id).short).join(' & ');
    return scope.length + ' collections';
  }

  function scopeSummaryHtml(scope) {
    return (
      '<div class="scope-summary">' +
        '<span class="scope-label">Searching in</span> ' +
        '<button type="button" class="scope-pick" id="scope-pick">' +
          esc(scopeLabel(scope)) + ' <span class="scope-caret">▾</span></button>' +
      '</div>'
    );
  }

  function buildScopeModal() {
    const scope = getScope();
    const rows = D.BOOKS.map((b) => {
      const on = scope.includes(b.id);
      const loaded = D.isLoaded(b.id);
      return (
        '<button type="button" class="scope-row' + (on ? ' on' : '') + '" data-book="' + b.id + '">' +
          '<span class="scope-box">' + (on ? '✓' : '') + '</span>' +
          '<span class="scope-row-name">' + esc(b.name) + (b.araOnly ? ' <span class="muted">· Arabic only</span>' : '') + '</span>' +
          '<span class="scope-row-sub">' + (loaded ? 'downloaded' : '~' + b.approxMB + ' MB') + '</span>' +
        '</button>'
      );
    }).join('');
    const allOn = D.BOOKS.every((b) => scope.includes(b.id));
    return (
      '<div class="modal-panel" role="dialog" aria-modal="true" aria-label="Choose collections">' +
        '<header class="modal-head">' +
          '<div><div class="modal-title">Search in</div>' +
          '<div class="modal-sub">' + scope.length + ' of ' + D.BOOKS.length + ' selected</div></div>' +
          '<button type="button" class="modal-x" id="scope-close" aria-label="Close">✕</button>' +
        '</header>' +
        '<div class="modal-body">' + rows + '</div>' +
        '<footer class="modal-foot">' +
          '<button type="button" class="linklike" id="scope-all">' + (allOn ? 'Clear all' : 'Select all') + '</button>' +
          '<button type="button" class="search-btn" id="scope-done">Done</button>' +
        '</footer>' +
      '</div>'
    );
  }

  function renderScopeModalInto(m) {
    m.innerHTML = buildScopeModal();
    const close = () => { m.hidden = true; document.body.style.overflow = ''; };
    m.querySelector('#scope-close').onclick = close;
    m.querySelector('#scope-done').onclick = close;
    m.querySelectorAll('.scope-row[data-book]').forEach((row) => {
      row.onclick = () => {
        const id = row.dataset.book;
        let next = getScope();
        next = next.includes(id) ? next.filter((x) => x !== id) : next.concat(id);
        setScope(next);
        renderScopeModalInto(m);
        refreshForScope();
      };
    });
    m.querySelector('#scope-all').onclick = () => {
      const allOn = D.BOOKS.every((b) => getScope().includes(b.id));
      setScope(allOn ? [] : D.BOOKS.map((b) => b.id));
      renderScopeModalInto(m);
      refreshForScope();
    };
  }

  function openScopeModal() {
    const m = document.getElementById('scope-modal');
    if (!m) return;
    renderScopeModalInto(m);
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    m.onclick = (e) => { if (e.target === m) { m.hidden = true; document.body.style.overflow = ''; } };
  }

  /* Re-render / re-navigate after the scope changes, keeping any active query
   * and filters. Setting an identical hash fires no hashchange, so in that
   * case we render directly. */
  function refreshForScope() {
    const cur = parseRoute();
    if (cur.view === 'search' && cur.q) {
      const target = href({ view: 'search', q: cur.q, in: getScope(), n: cur.n || '', g: cur.g || [] });
      if (location.hash === target) render();
      else location.hash = target;
    } else {
      render();
    }
  }

  function updateTabbar(view) {
    const map = { home: 'search', search: 'search', browse: 'browse', book: 'browse', section: 'browse', hadith: 'browse', settings: 'settings' };
    const active = map[view] || 'search';
    document.querySelectorAll('#tabbar .tab').forEach((t) => {
      t.classList.toggle('tab-on', t.dataset.tab === active);
    });
  }

  /* Settings as a full page — the mobile path (bottom-tab › Settings). Reuses
   * the same form/bindings as the desktop drawer. */
  function renderSettings() {
    app.innerHTML =
      '<section class="settings-page">' +
        '<nav class="crumbs"><a href="#/">Home</a> › Settings</nav>' +
        '<h1 class="settings-title">Settings</h1>' +
        settingsFormHtml() +
      '</section>';
    bindSettings(app);
  }

  function renderBrowse() {
    const books = D.BOOKS.map((b) =>
      '<a class="book-card" href="#/b/' + b.id + '">' +
        '<span class="book-card-name">' + esc(b.name) + '</span>' +
        '<span class="book-card-sub">Browse chapters →</span>' +
      '</a>'
    ).join('');
    app.innerHTML =
      '<section class="books browse-page">' +
        '<nav class="crumbs"><a href="#/">Home</a> › Browse</nav>' +
        '<h1 class="section-title">Browse collections</h1>' +
        '<div class="book-grid">' + books + '</div>' +
      '</section>';
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
    const pick = document.getElementById('scope-pick');
    if (pick) pick.addEventListener('click', openScopeModal);
    void scope; void currentQuery;
  }

  /* ---------- result filters (narrator, grade classification) ---------- */

  const GRADE_CATS = [
    { id: 'sahih', label: 'Sahih' },
    { id: 'hasan', label: 'Hasan' },
    { id: 'daif', label: 'Da’if / weak' },
    { id: 'ungraded', label: 'Ungraded / other' },
  ];

  /** Classification categories for a hadith, from its recorded grades. */
  function gradeCatsOf(bookId, hadith) {
    const grades = hadith.grades || [];
    if (!grades.length) return bookId === 'bukhari' || bookId === 'muslim' ? ['sahih'] : ['ungraded'];
    const cats = new Set();
    for (const g of grades) {
      const c = gradeClass(String(g.grade));
      if (c === 'grade-good') cats.add('sahih');
      else if (c === 'grade-ok') cats.add('hasan');
      else if (c === 'grade-weak' || c === 'grade-bad') cats.add('daif');
      else cats.add('ungraded');
    }
    return Array.from(cats);
  }

  /** Narrator filter: matches inside the attribution opening of the text
   * ("Narrated Aisha:", "Abu Huraira reported:", or the Arabic isnad). */
  function matchesNarrator(hadith, normNarrator) {
    if (!normNarrator) return true;
    return hadith._norm.slice(0, 200).includes(normNarrator);
  }

  function filtersHtml(route) {
    const g = route.g || [];
    const chips = GRADE_CATS.map((c) =>
      '<button type="button" class="chip chip-sm' + (g.includes(c.id) ? ' chip-on' : '') + '" data-grade="' + c.id + '">' +
        c.label + '</button>').join('');
    return (
      '<div class="filters">' +
        '<input id="filter-narrator" type="search" autocomplete="off" ' +
          'placeholder="Filter by narrator (e.g. Aisha, Abu Huraira)…" value="' + esc(route.n || '') + '" ' +
          'aria-label="Filter by narrator">' +
        '<div class="grade-filters"><span class="scope-label">Grade:</span>' + chips + '</div>' +
      '</div>'
    );
  }

  function bindFilterControls(route) {
    const nav = (n, g) => {
      location.hash = href({ view: 'search', q: route.q, in: getScope(), n, g });
    };
    const narr = document.getElementById('filter-narrator');
    narr.addEventListener('change', () => nav(narr.value.trim(), route.g || []));
    narr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nav(narr.value.trim(), route.g || []); } });
    document.querySelectorAll('.chip[data-grade]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.grade;
        let g = (route.g || []).slice();
        g = g.includes(id) ? g.filter((x) => x !== id) : g.concat(id);
        nav(narr.value.trim(), g);
      });
    });
  }

  function applyFilters(results, route) {
    const nq = route.n ? S.normalize(route.n) : '';
    const g = route.g || [];
    if (!nq && !g.length) return results;
    return results.filter((r) => {
      if (!matchesNarrator(r.hadith, nq)) return false;
      if (g.length) {
        const cats = gradeCatsOf(r.bookId, r.hadith);
        if (!cats.some((c) => g.includes(c))) return false;
      }
      return true;
    });
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

  /* ---------- copy formats ----------
   * Everything copied is verbatim from the dataset: reference, Arabic,
   * translation, chapter and recorded gradings — plus a source link. */

  function copyMeta(bookId, hadith) {
    const b = D.bookById(bookId);
    const ed = D.getEditionSync(bookId);
    const sec = ed ? D.sectionOf(ed, hadith.hadithnumber) : null;
    const grades = (hadith.grades || []).map((g) => g.grade + ' — ' + g.name).join('; ');
    const url = D.sunnahComUrl(bookId, hadith.hadithnumber) ||
      location.href.split('#')[0] + '#/b/' + bookId + '/' + hadith.hadithnumber;
    return { ref: b.name + ' ' + hadith.hadithnumber, sec, grades, url };
  }

  function plainCopy(bookId, hadith, arabic) {
    const m = copyMeta(bookId, hadith);
    // For Arabic-only narrations, make sure the Arabic is in the copy even
    // when the caller didn't pass it (e.g. result-card copy buttons).
    if (!arabic && !hadith.text) {
      const ar = D.getHadith(bookId, hadith.hadithnumber, 'ara');
      if (ar) arabic = ar.hadith.text;
    }
    let out = m.ref + '\n\n';
    if (arabic) out += arabic + '\n\n';
    if (hadith.text) out += hadith.text + '\n';
    if (m.grades) out += '\nGrade: ' + m.grades;
    if (m.sec && m.sec.name) out += '\nChapter: ' + m.sec.number + '. ' + m.sec.name;
    out += '\nSource: ' + m.url;
    return out;
  }

  function markdownCopy(bookId, hadith, arabic) {
    const m = copyMeta(bookId, hadith);
    const quote = (t) => t.split('\n').map((l) => '> ' + l).join('\n');
    let out = '**' + m.ref + '**\n\n';
    if (arabic) out += quote(arabic) + (hadith.text ? '\n>\n' : '\n\n');
    if (hadith.text) out += quote(hadith.text) + '\n\n';
    if (m.grades) out += '**Grade:** ' + m.grades + '  \n';
    if (m.sec && m.sec.name) out += '**Chapter:** ' + m.sec.number + '. ' + m.sec.name + '  \n';
    out += '**Source:** [' + m.url + '](' + m.url + ')\n';
    return out;
  }

  function htmlCopy(bookId, hadith, arabic) {
    const m = copyMeta(bookId, hadith);
    // Carry the user's font settings into the pasted rich text (Word/Docs
    // honor font-family when the font is available on their machine).
    const s = getSettings();
    const engStyle = ' style="font-family: ' + ENG_FONTS[s.engFont].css + ';"';
    const araStyle = ' style="font-family: ' + ARA_FONTS[s.araFont].css + '; font-size: 1.3em;"';
    let out = '<p' + engStyle + '><strong>' + esc(m.ref) + '</strong></p>';
    if (arabic) out += '<p dir="rtl" lang="ar"' + araStyle + '>' + esc(arabic) + '</p>';
    if (hadith.text) out += '<p' + engStyle + '>' + esc(hadith.text).replace(/\n/g, '<br>') + '</p>';
    const meta = [];
    if (m.grades) meta.push('<strong>Grade:</strong> ' + esc(m.grades));
    if (m.sec && m.sec.name) meta.push('<strong>Chapter:</strong> ' + esc(m.sec.number + '. ' + m.sec.name));
    meta.push('<strong>Source:</strong> <a href="' + esc(m.url) + '">' + esc(m.url) + '</a>');
    out += '<p' + engStyle + '>' + meta.join('<br>') + '</p>';
    return out;
  }

  /** Copy with a text/html flavor so Word / Google Docs keep the formatting. */
  function copyRich(html, plain, btn) {
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]).then(() => flashBtn(btn), () => copy(plain, btn));
    } else {
      copy(plain, btn);
    }
  }

  function flashBtn(btn) {
    const old = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = old; }, 1500);
  }

  /* ---------- hadith cards (search results, chapter lists, parallels) ---------- */

  function cardHtml(bookId, h, bodyHtml, badge, lang) {
    const link = href({ view: 'hadith', bookId, number: String(h.hadithnumber) });
    const rtl = lang === 'ara';
    return (
      '<article class="result">' +
        '<header class="result-head">' +
          '<a class="result-ref" href="' + link + '">' + refLabel(bookId, h) + '</a>' +
          '<span class="result-meta">' +
            (badge || '') + gradesHtml(bookId, h) +
            '<button type="button" class="card-copy" data-book="' + bookId + '" data-num="' + esc(String(h.hadithnumber)) + '" data-lang="' + (rtl ? 'ara' : 'eng') + '" ' +
              'title="Copy this hadith (text, grade and source link)">Copy</button>' +
          '</span>' +
        '</header>' +
        '<p class="result-text' + (rtl ? ' result-text-ar" dir="rtl" lang="ar' : '') + '">' +
          '<a class="quiet-link" href="' + link + '">' + bodyHtml + '</a></p>' +
      '</article>'
    );
  }

  function bindCardCopies(rootEl) {
    (rootEl || document).querySelectorAll('.card-copy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const got = D.getHadith(btn.dataset.book, btn.dataset.num, btn.dataset.lang || 'eng');
        if (got) copy(plainCopy(btn.dataset.book, got.hadith, null), btn);
      });
    });
  }

  /* Loading panel while editions download. */
  function loadingHtml(ids, lang) {
    const rows = ids.map((id) => {
      const b = D.bookById(id);
      const done = D.isLoaded(id, lang);
      return '<li data-load="' + id + '" class="' + (done ? 'done' : '') + '">' +
        esc(b.name) + (lang === 'ara' ? ' (Arabic text)' : '') +
        ' <span class="load-state">' + (done ? '✓' : '~' + b.approxMB + ' MB…') + '</span></li>';
    }).join('');
    return (
      '<div class="loading-panel">' +
        '<div class="spinner" aria-hidden="true"></div>' +
        '<p>Downloading collections (one-time; cached for future visits):</p>' +
        '<ul class="load-list">' + rows + '</ul>' +
      '</div>'
    );
  }

  function ensureLoaded(ids, lang) {
    return Promise.all(ids.map((id) =>
      D.loadEdition(id, lang).then(() => {
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
          '<a href="#/search?q=wudu">wudu</a>' +
          '<a href="#/search?q=%D8%A7%D9%84%D8%A3%D8%B9%D9%85%D8%A7%D9%84%20%D8%A8%D8%A7%D9%84%D9%86%D9%8A%D8%A7%D8%AA" dir="rtl" lang="ar">الأعمال بالنيات</a>' +
          '<a href="#/b/bukhari/5062">bukhari 5062</a>' +
        '</div>' +
        scopeSummaryHtml(scope) +
      '</section>' +
      '<section class="books"><h2>Browse collections</h2><div class="book-grid">' + books + '</div></section>';
    bindSearchControls(scope, '');
    document.getElementById('search-input').focus();
  }

  function renderSearch(route) {
    const q = route.q;
    if (route.in && route.in.length) setScope(route.in.filter((id) => D.bookById(id)));
    const scope = getScope();
    // Arabic-script queries search the Arabic editions; everything else
    // (English or transliteration) searches the translations.
    const lang = /[؀-ۿ]/.test(q) ? 'ara' : 'eng';
    if (!scope.length) {
      app.innerHTML =
        '<section class="search-page">' +
          searchBarHtml(q, false) +
          scopeSummaryHtml(scope) +
          filtersHtml(route) +
          '<div id="results"><p class="no-results">No collections selected. ' +
          'Open the <b>Searching in</b> picker above and choose at least one collection.</p></div>' +
        '</section>';
      bindSearchControls(scope, q);
      bindFilterControls(route);
      return;
    }
    app.innerHTML =
      '<section class="search-page">' +
        searchBarHtml(q, false) +
        scopeSummaryHtml(scope) +
        filtersHtml(route) +
        '<div id="results">' + loadingHtml(scope.filter((id) => !D.isLoaded(id, lang)), lang) + '</div>' +
      '</section>';
    bindSearchControls(scope, q);
    bindFilterControls(route);

    ensureLoaded(scope, lang).then(() => {
      // The user may have navigated away while editions were downloading.
      const now = parseRoute();
      if (now.view !== 'search' || now.q !== q) return;
      const eds = scope.map((id) => D.getEditionSync(id, lang)).filter(Boolean);
      const results = S.search(eds, q, RESULT_LIMIT);
      renderResults(q, results, scope, route);
    }).catch((e) => {
      const el = document.getElementById('results');
      if (el) el.innerHTML = '<p class="error">Could not download the collections (' + esc(e.message) + '). Check your connection and try again.</p>';
    });
  }

  function renderResults(q, results, scope, route) {
    const el = document.getElementById('results');
    if (!el) return;
    const unfiltered = results.length;
    results = applyFilters(results, route || {});
    const filteredOut = unfiltered - results.length;
    if (!results.length && filteredOut > 0) {
      el.innerHTML =
        '<p class="no-results">All ' + filteredOut + ' matches for <b>' + esc(q) + '</b> were hidden by your filters.</p>' +
        '<p class="no-results-tips">Clear the narrator/grade filters above to see them.</p>';
      return;
    }
    if (!results.length) {
      el.innerHTML =
        '<p class="no-results">No matches for <b>' + esc(q) + '</b> in the selected collections.</p>' +
        '<ul class="no-results-tips">' +
          '<li>Try fewer or more general words (every meaningful word must appear; filler words like “to” and “of” are ignored).</li>' +
          '<li>Add more collections above.</li>' +
          '<li>Looking for a specific hadith? Type e.g. <code>muslim 2564</code>.</li>' +
        '</ul>';
      return;
    }
    const strict = results.filter((r) => !r.partial);
    const partial = results.filter((r) => r.partial);
    const card = (r) => cardHtml(r.bookId, r.hadith, S.highlight(r.hadith.text, q, 420), '', r.lang);
    let html;
    if (strict.length) {
      html = '<p class="result-count">' + strict.length + (unfiltered === RESULT_LIMIT ? '+' : '') +
        ' result' + (strict.length === 1 ? '' : 's') + ' for <b>' + esc(q) + '</b> in ' +
        scope.map((id) => esc(D.bookById(id).short)).join(', ') +
        (filteredOut > 0 ? ' <span class="muted">(' + filteredOut + ' hidden by filters)</span>' : '') +
        '</p>' + strict.map(card).join('');
    } else {
      html = '<p class="result-count">No hadith contain every word of <b>' + esc(q) + '</b> — closest matches below.</p>';
    }
    if (partial.length) {
      html += '<p class="result-count partial-divider">Close matches <span class="muted">— one of your words is missing from these</span>:</p>' +
        partial.map(card).join('');
    }
    el.innerHTML = html;
    bindCardCopies(el);
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
        bindCardCopies(el);
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
      bindCardCopies(el);
    }).catch(errInto('section-body'));
  }

  function hadithListHtml(bookId, hadiths) {
    return hadiths.map((h) => {
      // Narrations with no English on the source (e.g. Sunan ad-Darimi)
      // are listed with their Arabic text instead of an empty card.
      if (!h.text) {
        const ar = D.getHadith(bookId, h.hadithnumber, 'ara');
        if (ar && ar.hadith.text) {
          const t = ar.hadith.text.length > 260 ? ar.hadith.text.slice(0, 260) + '…' : ar.hadith.text;
          return cardHtml(bookId, h, esc(t), '', 'ara');
        }
      }
      const text = h.text.length > 320 ? h.text.slice(0, 320) + '…' : h.text;
      return cardHtml(bookId, h, esc(text));
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
      let arabicText = null; // set once the Arabic loads; copy buttons include it

      el.innerHTML =
        '<div class="detail-grid">' +
        '<div class="detail-main">' +
        '<article class="hadith-card">' +
          '<header>' +
            '<h1>' + refLabel(b.id, hadith) + '</h1>' +
            (sec ? '<p class="hadith-section"><a href="' + href({ view: 'section', bookId: b.id, section: sec.number }) + '">Chapter ' + esc(sec.number) + ': ' + esc(sec.name) + '</a></p>' : '') +
            '<p class="hadith-grades">' + gradesHtml(b.id, hadith) + '</p>' +
          '</header>' +
          '<div class="hadith-arabic" id="arabic-slot" dir="rtl" lang="ar"><span class="muted">Loading Arabic…</span></div>' +
          (hadith.text
            ? '<div class="hadith-english" lang="en">' + esc(hadith.text) + '</div>'
            : '<p class="muted">The source has no English translation for this narration; the Arabic text is shown above.</p>') +
          '<footer class="hadith-actions">' +
            '<button type="button" class="action-btn" id="copy-text" title="Plain text: reference, Arabic, translation, grade, source">Copy text</button>' +
            '<button type="button" class="action-btn" id="copy-md" title="Markdown: for notes apps, Obsidian, GitHub…">Copy Markdown</button>' +
            '<button type="button" class="action-btn" id="copy-rich" title="Formatted: paste into Word / Google Docs with formatting kept">Copy for Docs</button>' +
            '<button type="button" class="action-btn" id="copy-link">Copy link</button>' +
          '</footer>' +
          '<nav class="pager">' +
            (prev ? '<a href="' + href({ view: 'hadith', bookId: b.id, number: String(prev.hadithnumber) }) + '">← ' + esc(String(prev.hadithnumber)) + '</a>' : '<span></span>') +
            (next ? '<a href="' + href({ view: 'hadith', bookId: b.id, number: String(next.hadithnumber) }) + '">' + esc(String(next.hadithnumber)) + ' →</a>' : '<span></span>') +
          '</nav>' +
        '</article>' +
        '<section class="related">' +
          '<h2>Also narrated in <span class="how muted">— matched automatically by shared wording; texts are verbatim</span></h2>' +
          '<div id="related-list"></div>' +
          '<p class="related-note muted" id="related-note"></p>' +
        '</section>' +
        '</div>' +
        '<aside class="detail-rail">' +
          '<div class="rail-block"><h3 class="rail-label">About</h3>' +
            '<dl class="rail-facts">' +
              '<div><dt>Collection</dt><dd>' + esc(b.name) + '</dd></div>' +
              (sec ? '<div><dt>Chapter</dt><dd><a href="' + href({ view: 'section', bookId: b.id, section: sec.number }) + '">' + esc(sec.number) + '. ' + esc(sec.name) + '</a></dd></div>' : '') +
              '<div><dt>Number</dt><dd>' + esc(String(hadith.hadithnumber)) + '</dd></div>' +
              '<div><dt>Grade</dt><dd>' + (gradesHtml(b.id, hadith) || '<span class="muted">Not recorded</span>') + '</dd></div>' +
            '</dl>' +
          '</div>' +
          '<div class="rail-block"><h3 class="rail-label">Read more</h3>' +
            '<ul class="explain-links" id="explain-links"></ul>' +
            '<p class="muted how">External links — nothing here is generated by SunnahFinder.</p>' +
          '</div>' +
        '</aside>' +
        '</div>';

      document.getElementById('copy-text').addEventListener('click', function () {
        copy(plainCopy(b.id, hadith, arabicText), this);
      });
      document.getElementById('copy-md').addEventListener('click', function () {
        copy(markdownCopy(b.id, hadith, arabicText), this);
      });
      document.getElementById('copy-rich').addEventListener('click', function () {
        copyRich(htmlCopy(b.id, hadith, arabicText), plainCopy(b.id, hadith, arabicText), this);
      });
      document.getElementById('copy-link').addEventListener('click', function () {
        copy(location.href, this);
      });

      renderRelated(b.id, hadith);
      renderExplainLinks(b.id, hadith, sunnahUrl, null);

      D.loadArabic(b.id, hadith.hadithnumber).then((ar) => {
        const slot = document.getElementById('arabic-slot');
        if (!slot) return;
        arabicText = ar || null;
        slot.innerHTML = ar ? esc(ar) : '';
        if (!ar) slot.style.display = 'none';
        renderExplainLinks(b.id, hadith, sunnahUrl, arabicText);
      }).catch(() => {
        const slot = document.getElementById('arabic-slot');
        if (slot) slot.style.display = 'none';
      });
    }).catch(errInto('detail-body'));
  }

  /* "Similar narrations": verbatim texts from the downloaded collections that
   * share most of their distinctive wording with this hadith (see SFData.similarHadith). */
  function renderRelated(bookId, hadith) {
    const list = document.getElementById('related-list');
    const note = document.getElementById('related-note');
    if (!list || !note) return;
    const matches = D.similarHadith(bookId, hadith.hadithnumber, 6);
    list.innerHTML = matches.length
      ? matches.map((m) => {
          const full = m.hadith.text || '';
          const text = full.length > 120 ? full.slice(0, 120) + '…' : full;
          const link = href({ view: 'hadith', bookId: m.bookId, number: String(m.hadith.hadithnumber) });
          return '<a class="similar-row" href="' + link + '">' +
            '<span class="similar-ref">' + esc(D.bookById(m.bookId).short) + ' ' + esc(String(m.hadith.hadithnumber)) + '</span>' +
            '<span class="similar-text">' + esc(text) + '</span>' +
            '<span class="similar-pct" title="Share of distinctive words in common">' + Math.round(m.score * 100) + '%</span>' +
          '</a>';
        }).join('')
      : '<p class="muted">No close parallels found in the downloaded collections.</p>';

    const loaded = D.loadedBookIds();
    const remaining = D.BOOKS.filter((bk) => !loaded.includes(bk.id));
    if (remaining.length) {
      note.innerHTML = 'Compared against ' + loaded.map((id) => esc(D.bookById(id).short)).join(', ') +
        '. <button type="button" class="linklike" id="related-more">Search all ' + D.BOOKS.length + ' collections</button>';
      document.getElementById('related-more').addEventListener('click', function () {
        this.disabled = true;
        this.textContent = 'Downloading the other collections…';
        const route = parseRoute();
        ensureLoaded(D.BOOKS.map((bk) => bk.id)).then(() => {
          const now = parseRoute();
          if (now.view === 'hadith' && now.bookId === route.bookId && now.number === route.number) {
            renderRelated(bookId, hadith);
          }
        }).catch(() => {
          this.disabled = false;
          this.textContent = 'Retry downloading the other collections';
        });
      });
    } else {
      note.textContent = 'Compared against all ' + D.BOOKS.length + ' collections.';
    }
  }

  /* Links to the same hadith (or a targeted search for it) on trusted external
   * sites. We only link out — no commentary is generated or excerpted here. */
  function renderExplainLinks(bookId, hadith, sunnahUrl, arabicText) {
    const ul = document.getElementById('explain-links');
    if (!ul) return;
    const links = [];
    if (sunnahUrl) {
      links.push({ url: sunnahUrl, label: 'Sunnah.com — this hadith', detail: 'full isnad, alternative translations and in-book references' });
    } else {
      links.push({
        url: 'https://sunnah.com/search?q=' + encodeURIComponent(hadith.text.split(/\s+/).slice(0, 8).join(' ')),
        label: 'Sunnah.com — search for this hadith', detail: 'no direct page mapping for this collection; opens a text search',
      });
    }
    if (arabicText) {
      const words = window.SFSearch.normalize(arabicText).split(' ');
      const tail = words.slice(-10).join(' ');
      links.push({
        url: 'https://dorar.net/hadith/search?q=' + encodeURIComponent(tail),
        label: 'Dorar.net — takhrij & rulings (Arabic)', detail: 'searches the hadith encyclopedia using this narration’s Arabic wording',
      });
    }
    links.push({
      url: 'https://islamqa.info/en/search?q=' + encodeURIComponent(D.bookById(bookId).short + ' ' + hadith.hadithnumber),
      label: 'IslamQA.info — search fatwas citing this hadith', detail: 'scholarly answers that reference this narration',
    });
    ul.innerHTML = links.map((l) =>
      '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' ↗</a>' +
      '<span class="muted"> — ' + esc(l.detail) + '</span></li>'
    ).join('');
  }

  function copy(text, btn) {
    const done = () => flashBtn(btn);
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
      case 'browse': renderBrowse(); break;
      case 'settings': renderSettings(); break;
      case 'book': renderBook(route); break;
      case 'section': renderSection(route); break;
      case 'hadith': renderHadith(route); break;
      default: renderHome();
    }
    updateTabbar(route.view);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      const input = document.getElementById('search-input');
      if (input) { e.preventDefault(); input.focus(); input.select(); }
    }
  });

  window.addEventListener('hashchange', render);
  initSettings();
  render();
})();
