/*
 * Stage Tabs: song library, setlists, chord sheet editor and performance view.
 * Plain JavaScript, no build step. Views are rendered from `state` into #app;
 * clicks are handled through data-act attributes.
 */
(function () {
  'use strict';

  const CP = window.ChordPro;
  const Store = window.Store;
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toastEl = document.getElementById('toast');

  const state = {
    songs: [],
    setlists: [],
    view: 'library', // library | perform | edit | setlist | settings
    tab: 'songs', // songs | setlists
    sort: 'title', // title | artist
    query: '',
    selectedId: null,
    setlistId: null,
    perform: null, // { songId, setlistId, index }
    edit: null, // { draft, isNew, pane, returnTo }
    settings: { stage: 'dark' },
  };

  const APP_VERSION = '1.1';
  const SPEED_MIN = 1, SPEED_MAX = 20, SPEED_DEFAULT = 6;
  const FONT_MIN = 0.6, FONT_MAX = 2.4;

  // ---------- Small helpers ----------

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const byId = (list, id) => list.find((x) => x.id === id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const $ = (sel, rootEl) => (rootEl || document).querySelector(sel);

  const ICONS = {
    note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    wand: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="M13 6l5 5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  };
  const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  // Sorting ignores case, accents and a leading "The", "A" or "An".
  function sortKey(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^(the|a|an)\s+/, '').replace(/^[^a-z0-9]+/, '');
  }
  function letterOf(s) {
    const c = sortKey(s).charAt(0);
    return c >= 'a' && c <= 'z' ? c.toUpperCase() : '#';
  }

  // ---------- Data ----------

  function newSong(fields) {
    const now = Date.now();
    return Object.assign({
      id: uid('s'), title: '', artist: '', key: '', capo: 0, tempo: '', body: '',
      transpose: 0, fontScale: 1, scrollLevel: SPEED_DEFAULT, example: false,
      createdAt: now, updatedAt: now,
    }, fields || {});
  }

  async function saveSong(song) {
    song.updatedAt = Date.now();
    const i = state.songs.findIndex((s) => s.id === song.id);
    if (i >= 0) state.songs[i] = song; else state.songs.push(song);
    await Store.put('songs', song);
  }

  // For per-song settings changed often (speed, size, key) during a show.
  let prefTimer = 0;
  function saveSongPrefsSoon(song) {
    clearTimeout(prefTimer);
    prefTimer = setTimeout(() => { Store.put('songs', song); }, 400);
  }

  async function saveSetlist(sl) {
    sl.updatedAt = Date.now();
    const i = state.setlists.findIndex((s) => s.id === sl.id);
    if (i >= 0) state.setlists[i] = sl; else state.setlists.push(sl);
    await Store.put('setlists', sl);
  }

  async function deleteSong(id) {
    state.songs = state.songs.filter((s) => s.id !== id);
    await Store.remove('songs', id);
    for (const sl of state.setlists) {
      if (sl.songIds.includes(id)) { sl.songIds = sl.songIds.filter((x) => x !== id); await saveSetlist(sl); }
    }
    if (state.selectedId === id) state.selectedId = null;
  }

  async function loadAll() {
    await Store.open();
    const seeded = await Store.getMeta('seeded', false);
    if (!seeded) {
      const now = Date.now();
      await Store.putMany('songs', window.Seed.songs.map((s, i) => newSong(Object.assign({}, s, { example: true, createdAt: now + i, updatedAt: now + i }))));
      await Store.putMany('setlists', window.Seed.setlists.map((s) => Object.assign({ example: true, updatedAt: now }, s)));
      await Store.setMeta('seeded', true);
    }
    state.songs = await Store.getAll('songs');
    state.setlists = await Store.getAll('setlists');
    state.settings = Object.assign(state.settings, await Store.getMeta('settings', {}));
    state.sort = await Store.getMeta('sort', 'title');
    applyStage();
    Store.requestPersistence();
  }

  function applyStage() {
    document.documentElement.setAttribute('data-stage', state.settings.stage === 'light' ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.settings.stage === 'light' ? '#ffffff' : '#0d1016');
  }

  // ---------- Chord sheet rendering ----------

  function renderSheet(song, opts) {
    const o = opts || {};
    const parsed = CP.parse(song.body);
    const steps = o.transpose != null ? o.transpose : (song.transpose || 0);
    const tr = CP.makeTransposer(song.key, steps, CP.chordsIn(song.body));
    let html = '';
    let inSection = false;
    let chorus = null; // items of the last chorus, for {chorus} repeats
    let collecting = null;

    const lineHtml = (it) => {
      if (!it.hasChords) return '<p class="ln"><span class="ly">' + esc(it.segs.map((s) => s.t).join('')) + '</span></p>';
      // Split each segment into words so long lines wrap between words.
      const cells = [];
      for (const s of it.segs) {
        const pieces = s.t ? s.t.match(/\S*\s*/g).filter(Boolean) : [''];
        pieces.forEach((p, i) => cells.push({ c: i === 0 ? s.c : '', t: p }));
      }
      const chordsOnly = cells.every((c) => !c.t.trim());
      let out = '', word = '';
      cells.forEach((cell, i) => {
        const chord = cell.c ? tr(cell.c) : '';
        word += '<span class="c"><span class="ch' + (chord ? ' on' : '') + '">' + (chord ? esc(chord) : '&nbsp;') + '</span><span class="ly">' + (esc(cell.t) || '') + '</span></span>';
        const endsWord = /\s$/.test(cell.t) || i === cells.length - 1 || (chordsOnly);
        if (endsWord) { out += '<span class="w">' + word + '</span>'; word = ''; }
      });
      return '<p class="ln has-ch' + (chordsOnly ? ' chords-only' : '') + '">' + out + '</p>';
    };

    const itemHtml = (it) => {
      switch (it.type) {
        case 'line': return lineHtml(it);
        case 'blank': return '<div class="gap"></div>';
        case 'label': return '<p class="label">' + esc(it.text) + '</p>';
        case 'tab': return (it.label ? '<p class="label">' + esc(it.label) + '</p>' : '') + '<pre class="tab">' + esc(it.lines.join('\n')) + '</pre>';
        default: return '';
      }
    };

    for (const it of parsed.items) {
      if (it.type === 'start') {
        if (inSection) html += '</section>';
        html += '<section class="sec sec-' + it.kind + '">' + (it.label ? '<p class="label">' + esc(it.label) + '</p>' : '');
        inSection = true;
        collecting = it.kind === 'chorus' ? { label: it.label, items: [] } : null;
        continue;
      }
      if (it.type === 'end') {
        if (inSection) html += '</section>';
        inSection = false;
        if (collecting) { chorus = collecting; collecting = null; }
        continue;
      }
      if (it.type === 'label' && it.repeat && chorus) {
        html += '<section class="sec sec-chorus"><p class="label">' + esc(chorus.label || 'Chorus') + '</p>' + chorus.items.map(itemHtml).join('') + '</section>';
        continue;
      }
      if (collecting) collecting.items.push(it);
      html += itemHtml(it);
    }
    if (inSection) html += '</section>';
    const fs = o.fontScale != null ? o.fontScale : null;
    return '<article class="sheet"' + (fs ? ' style="--fs:' + fs + '"' : '') + '>' + (html || '<p class="ln"><span class="ly" style="color:var(--muted)">No chords or lyrics yet.</span></p>') + '</article>';
  }

  // Shrinks guitar tab blocks that are wider than the screen so every line
  // stays readable without sideways scrolling.
  function fitTabs(rootEl) {
    (rootEl || document).querySelectorAll('pre.tab').forEach((pre) => {
      pre.style.fontSize = '';
      const avail = pre.clientWidth;
      if (!avail || pre.scrollWidth <= avail + 1) return;
      const cs = getComputedStyle(pre);
      const px = parseFloat(cs.fontSize);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const ratio = (avail - pad) / (pre.scrollWidth - pad);
      pre.style.fontSize = Math.max(8, Math.floor(px * ratio * 10) / 10) + 'px';
    });
  }

  function keyInfo(song) {
    const t = song.transpose || 0;
    const capo = Number(song.capo) || 0;
    const shapeKey = song.key ? CP.transposeKey(song.key, t) : '';
    const sounding = song.key && capo ? CP.transposeKey(song.key, t + capo) : '';
    return { shapeKey, sounding, capo, t };
  }

  function songChips(song) {
    const k = keyInfo(song);
    let s = '';
    if (k.shapeKey) s += '<span class="chip key">' + esc(k.shapeKey) + '</span>';
    if (k.capo) s += '<span class="chip">Capo ' + k.capo + '</span>';
    if (song.example) s += '<span class="chip example">Example</span>';
    return s;
  }

  function findOnlineLinks(q, small) {
    const query = encodeURIComponent(q.trim());
    const cls = 'btn' + (small ? ' small' : '') + (q.trim() ? '' : ' is-disabled');
    return '<a class="' + cls + '" target="_blank" rel="noopener" href="https://www.ultimate-guitar.com/search.php?search_type=title&value=' + query + '">' + icon('globe') + 'Ultimate Guitar</a>' +
      '<a class="' + cls + '" target="_blank" rel="noopener" href="https://www.songsterr.com/?pattern=' + query + '">' + icon('globe') + 'Songsterr</a>';
  }

  // ---------- Views ----------

  function render() {
    stopScroll(false);
    if (state.view !== 'perform') releaseWakeLock();
    switch (state.view) {
      case 'perform': return renderPerform();
      case 'edit': return renderEdit();
      case 'setlist': return renderSetlist();
      case 'settings': return renderSettings();
      default: return renderLibrary();
    }
  }

  // ----- Library -----

  function filteredSongs() {
    const q = sortKey(state.query).trim();
    let list = state.songs;
    if (q) list = list.filter((s) => sortKey(s.title).includes(q) || sortKey(s.artist).includes(q) || String(s.title + ' ' + s.artist).toLowerCase().includes(state.query.toLowerCase().trim()));
    const field = state.sort;
    const other = field === 'title' ? 'artist' : 'title';
    return list.slice().sort((a, b) => sortKey(a[field]).localeCompare(sortKey(b[field])) || sortKey(a[other]).localeCompare(sortKey(b[other])));
  }

  function renderLibrary() {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (wide && (!state.selectedId || !byId(state.songs, state.selectedId))) {
      const first = filteredSongs()[0];
      state.selectedId = first ? first.id : null;
    }
    app.innerHTML =
      '<div class="view library">' +
        '<header class="topbar gutter">' +
          '<div class="brand"><span class="logo">' + icon('note') + '</span><h1>Stage Tabs</h1></div>' +
          '<div class="seg" role="tablist">' +
            '<button role="tab" data-act="tab" data-tab="songs" aria-selected="' + (state.tab === 'songs') + '">Songs</button>' +
            '<button role="tab" data-act="tab" data-tab="setlists" aria-selected="' + (state.tab === 'setlists') + '">Setlists</button>' +
          '</div>' +
          '<button class="btn icon-only ghost" data-act="settings" aria-label="Settings and backup">' + icon('gear') + '</button>' +
          (state.tab === 'songs'
            ? '<button class="btn primary" data-act="new-song">' + icon('plus') + 'Add song</button>'
            : '<button class="btn primary" data-act="focus-new-set">' + icon('plus') + 'New setlist</button>') +
        '</header>' +
        (state.tab === 'songs' ? libraryBody() : setlistsBody()) +
      '</div>';
    if (state.tab === 'songs') { updateList(); updatePreview(); }
  }

  function libraryBody() {
    return '<div class="lib-body">' +
      '<section class="lib-list">' +
        '<div class="lib-tools gutter">' +
          '<div class="search">' + icon('search') + '<label class="sr-only" for="q">Search songs</label><input id="q" class="input" type="search" placeholder="Search songs or artists" autocomplete="off" autocorrect="off" spellcheck="false" value="' + esc(state.query) + '"></div>' +
          '<div class="seg" aria-label="Sort">' +
            '<button data-act="sort" data-sort="title" aria-pressed="' + (state.sort === 'title') + '">A–Z Title</button>' +
            '<button data-act="sort" data-sort="artist" aria-pressed="' + (state.sort === 'artist') + '">Artist</button>' +
          '</div>' +
        '</div>' +
        '<div class="list-scroll gutter" id="list"></div>' +
        '<nav class="az" id="az" aria-label="Jump to letter"></nav>' +
      '</section>' +
      '<section class="lib-preview" id="preview"></section>' +
    '</div>';
  }

  function updateList() {
    const listEl = $('#list');
    if (!listEl) return;
    const songs = filteredSongs();
    if (!state.songs.length) {
      listEl.innerHTML = '<div class="empty"><strong>No songs yet</strong><span>Add your first song by pasting a chord sheet.</span><button class="btn primary" data-act="new-song">' + icon('plus') + 'Add song</button></div>';
      $('#az').innerHTML = '';
      return;
    }
    if (!songs.length) {
      listEl.innerHTML = '<div class="empty"><strong>No songs match “' + esc(state.query) + '”</strong><span>Look it up online, copy the chords, then add it here.</span>' +
        '<div class="row-actions">' + findOnlineLinks(state.query, true) + '</div>' +
        '<button class="btn" data-act="new-song-from-query">' + icon('plus') + 'Add “' + esc(state.query) + '”</button></div>';
      $('#az').innerHTML = '';
      return;
    }
    const groups = [];
    let cur = null;
    for (const s of songs) {
      const head = state.sort === 'artist' ? (s.artist || 'Unknown artist') : letterOf(s.title);
      if (!cur || cur.head !== head) { cur = { head, letter: state.sort === 'artist' ? letterOf(s.artist || '#') : head, songs: [] }; groups.push(cur); }
      cur.songs.push(s);
    }
    listEl.innerHTML = groups.map((g, gi) =>
      '<div class="group" data-letter="' + g.letter + '" id="grp-' + gi + '">' +
        '<div class="group-head">' + esc(g.head) + '</div>' +
        g.songs.map((s) =>
          '<button class="song-row" data-act="open-song" data-id="' + s.id + '"' + (s.id === state.selectedId ? ' aria-current="true"' : '') + '>' +
            '<span class="row-main"><span class="row-title">' + esc(s.title || 'Untitled') + '</span><span class="row-sub">' + esc(s.artist || 'Unknown artist') + '</span></span>' +
            '<span class="row-meta">' + songChips(s) + '</span>' +
          '</button>').join('') +
      '</div>').join('');
    const present = new Set(groups.map((g) => g.letter));
    $('#az').innerHTML = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) =>
      '<button data-act="jump" data-letter="' + l + '" class="' + (present.has(l) ? '' : 'off') + '" aria-label="Jump to ' + l + '">' + l + '</button>').join('');
  }

  function updatePreview() {
    const el = $('#preview');
    if (!el) return;
    const song = byId(state.songs, state.selectedId);
    if (!song) { el.innerHTML = '<div class="empty"><strong>Pick a song</strong><span>Its chord sheet shows here.</span></div>'; return; }
    const k = keyInfo(song);
    el.innerHTML =
      '<div class="preview-head gutter">' +
        '<div class="titles"><span class="eyebrow">Song</span><h2>' + esc(song.title || 'Untitled') + '</h2>' +
          '<div class="by">' + esc(song.artist || 'Unknown artist') + songChips(song) + (k.sounding ? '<span class="chip">Sounds in ' + esc(k.sounding) + '</span>' : '') + '</div></div>' +
        '<div class="actions">' +
          '<button class="btn" data-act="add-to-setlist" data-id="' + song.id + '">' + icon('list') + 'Add to setlist</button>' +
          '<button class="btn" data-act="edit-song" data-id="' + song.id + '">' + icon('edit') + 'Edit</button>' +
          '<button class="btn primary" data-act="perform" data-id="' + song.id + '">' + icon('play') + 'Play</button>' +
        '</div>' +
      '</div>' +
      '<div class="preview-scroll gutter">' + renderSheet(song) + '</div>';
    fitTabs(el);
  }

  function setlistsBody() {
    const lists = state.setlists.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return '<div class="scroll-body gutter">' +
      '<form class="new-set" id="new-set-form"><label class="sr-only" for="new-set-name">Setlist name</label>' +
        '<input class="input" id="new-set-name" placeholder="New setlist name, e.g. Saturday at Rosie’s" autocomplete="off">' +
        '<button class="btn" type="submit">' + icon('plus') + 'Create</button></form>' +
      (lists.length ? '<div class="setlist-grid">' + lists.map((sl) => {
        const songs = sl.songIds.map((id) => byId(state.songs, id)).filter(Boolean);
        return '<button class="set-card" data-act="open-setlist" data-id="' + sl.id + '">' +
          '<span class="count">' + songs.length + ' song' + (songs.length === 1 ? '' : 's') + '</span>' +
          '<h3>' + esc(sl.name) + '</h3>' +
          (songs.length ? '<ol>' + songs.slice(0, 4).map((s) => '<li>' + esc(s.title) + '</li>').join('') + (songs.length > 4 ? '<li>…</li>' : '') + '</ol>' : '<span style="color:var(--muted)">Empty. Tap to add songs.</span>') +
        '</button>';
      }).join('') + '</div>'
        : '<div class="empty"><strong>No setlists yet</strong><span>Make one for each gig, then play straight through it.</span></div>') +
    '</div>';
  }

  // ----- Setlist detail -----

  function renderSetlist() {
    const sl = byId(state.setlists, state.setlistId);
    if (!sl) { state.view = 'library'; return render(); }
    const songs = sl.songIds.map((id) => byId(state.songs, id)).filter(Boolean);
    app.innerHTML =
      '<div class="view">' +
        '<header class="topbar gutter">' +
          '<button class="btn ghost icon-only" data-act="home" aria-label="Back to library">' + icon('back') + '</button>' +
          '<h2>' + esc(sl.name) + '</h2>' +
          '<button class="btn" data-act="add-songs-to-set">' + icon('plus') + 'Add songs</button>' +
          '<button class="btn primary" data-act="play-set"' + (songs.length ? '' : ' disabled') + '>' + icon('play') + 'Start show</button>' +
        '</header>' +
        '<div class="scroll-body gutter"><div class="narrow">' +
          '<div class="field"><label for="set-name">Setlist name</label><input class="input" id="set-name" value="' + esc(sl.name) + '"></div>' +
          '<div style="margin-top:18px">' +
          (songs.length ? songs.map((s, i) =>
            '<div class="set-row">' +
              '<span class="num">' + (i + 1) + '</span>' +
              '<span class="row-main" data-act="play-set-at" data-index="' + i + '"><span class="row-title">' + esc(s.title) + '</span><span class="row-sub">' + esc(s.artist) + (keyInfo(s).shapeKey ? ' · ' + esc(keyInfo(s).shapeKey) : '') + '</span></span>' +
              '<span class="tools">' +
                '<button class="btn icon-only small ghost" data-act="set-move" data-index="' + i + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
                '<button class="btn icon-only small ghost" data-act="set-move" data-index="' + i + '" data-dir="1" aria-label="Move down"' + (i === songs.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
                '<button class="btn icon-only small ghost" data-act="set-remove" data-index="' + i + '" aria-label="Remove from setlist">' + icon('x') + '</button>' +
              '</span>' +
            '</div>').join('')
            : '<div class="empty"><strong>This setlist is empty</strong><button class="btn primary" data-act="add-songs-to-set">' + icon('plus') + 'Add songs</button></div>') +
          '</div>' +
          '<div style="margin-top:28px"><button class="btn danger" data-act="delete-setlist">Delete setlist</button></div>' +
        '</div></div>' +
      '</div>';
  }

  // ----- Editor -----

  function startEdit(song, isNew, returnTo) {
    state.edit = { draft: Object.assign({}, song), isNew, pane: 'edit', returnTo: returnTo || state.view };
    state.view = 'edit';
    render();
  }

  function renderEdit() {
    const e = state.edit;
    const d = e.draft;
    const q = [d.title, d.artist].filter(Boolean).join(' ');
    app.innerHTML =
      '<div class="view">' +
        '<header class="topbar gutter">' +
          '<button class="btn ghost" data-act="cancel-edit">Cancel</button>' +
          '<h2>' + (e.isNew ? 'Add song' : 'Edit song') + '</h2>' +
          '<button class="btn primary" data-act="save-edit">Save</button>' +
        '</header>' +
        '<div class="edit-body">' +
          '<section class="edit-form gutter">' +
            '<div class="form-row">' +
              '<div class="field"><label for="ed-title">Song title</label><input class="input" id="ed-title" value="' + esc(d.title) + '" placeholder="e.g. Amazing Grace" autocomplete="off"></div>' +
              '<div class="field"><label for="ed-artist">Artist or band</label><input class="input" id="ed-artist" value="' + esc(d.artist) + '" placeholder="e.g. Traditional" autocomplete="off"></div>' +
            '</div>' +
            '<div class="form-row small">' +
              '<div class="field"><label for="ed-key">Key</label><input class="input" id="ed-key" value="' + esc(d.key) + '" placeholder="e.g. G or Am" autocomplete="off" autocapitalize="characters"></div>' +
              '<div class="field"><label for="ed-capo">Capo</label><select class="input" id="ed-capo">' +
                Array.from({ length: 10 }, (_, i) => '<option value="' + i + '"' + (Number(d.capo) === i ? ' selected' : '') + '>' + (i ? 'Fret ' + i : 'None') + '</option>').join('') + '</select></div>' +
              '<div class="field"><label for="ed-tempo">Tempo / notes</label><input class="input" id="ed-tempo" value="' + esc(d.tempo) + '" placeholder="e.g. 92 bpm" autocomplete="off"></div>' +
            '</div>' +
            '<div class="find-online" id="find-online"><p>Find the chords online. Copy them from the page, come back, and paste them below.</p>' + findOnlineLinks(q, true) + '</div>' +
            '<div class="mobile-tabs"><div class="seg">' +
              '<button data-act="ed-pane" data-pane="edit" aria-pressed="' + (e.pane === 'edit') + '">Chord sheet</button>' +
              '<button data-act="ed-pane" data-pane="preview" aria-pressed="' + (e.pane === 'preview') + '">Preview</button>' +
            '</div></div>' +
            '<div class="field" id="ed-body-wrap"' + (e.pane === 'preview' ? ' hidden' : '') + '>' +
              '<label for="ed-body">Chords and lyrics</label>' +
              '<div class="body-tools">' +
                '<button class="btn small" data-act="convert">' + icon('wand') + 'Line up chords</button>' +
                '<label class="btn small" for="ed-file">' + icon('file') + 'Open a file</label>' +
                '<input type="file" id="ed-file" accept=".txt,.cho,.chopro,.chordpro,.crd,.pro,text/plain" hidden>' +
                (d.body ? '' : '<button class="btn small ghost" data-act="paste-example">Try an example</button>') +
              '</div>' +
              '<textarea class="textarea" id="ed-body" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder="Paste a chord sheet here. Chords written on the line above the lyrics are lined up automatically.">' + esc(d.body) + '</textarea>' +
              '<details class="help"><summary>How to write chords by hand</summary>' +
                '<p><code>[G]</code> before a word puts the G chord above it: <code>[G]Amazing [C]grace</code>.</p>' +
                '<p><code>{c: Verse 2}</code> adds a section name. <code>{soc}</code> … <code>{eoc}</code> marks a chorus, and <code>{chorus}</code> repeats it later.</p>' +
                '<p><code>{sot}</code> … <code>{eot}</code> keeps guitar tab exactly as typed.</p>' +
              '</details>' +
            '</div>' +
            '<div class="edit-pane-preview" id="ed-preview-mobile"' + (e.pane === 'preview' ? '' : ' hidden') + '></div>' +
            '<div class="row-actions">' +
              '<button class="btn" data-act="feedback-song">' + icon('send') + 'Song looks wrong? Send it</button>' +
              (e.isNew ? '' : '<button class="btn danger" data-act="delete-song">Delete song</button>') +
            '</div>' +
          '</section>' +
          '<section class="edit-preview gutter" id="ed-preview"></section>' +
        '</div>' +
      '</div>';
    updateEditPreview();
  }

  function readEditForm() {
    const d = state.edit.draft;
    const v = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    if (v('ed-title') !== undefined) d.title = v('ed-title').trim();
    if (v('ed-artist') !== undefined) d.artist = v('ed-artist').trim();
    if (v('ed-key') !== undefined) d.key = v('ed-key').trim();
    if (v('ed-capo') !== undefined) d.capo = Number(v('ed-capo')) || 0;
    if (v('ed-tempo') !== undefined) d.tempo = v('ed-tempo').trim();
    if (v('ed-body') !== undefined) d.body = v('ed-body');
    return d;
  }

  let editPreviewTimer = 0;
  function updateEditPreview() {
    clearTimeout(editPreviewTimer);
    editPreviewTimer = setTimeout(() => {
      if (state.view !== 'edit') return;
      const d = readEditForm();
      const html = renderSheet(Object.assign({}, d, { transpose: 0 }));
      const wide = $('#ed-preview');
      if (wide) wide.innerHTML = '<span class="eyebrow">Preview</span>' + html;
      const mob = $('#ed-preview-mobile');
      if (mob && !mob.hidden) mob.innerHTML = html;
      fitTabs(app);
      const q = [d.title, d.artist].filter(Boolean).join(' ');
      const fo = $('#find-online');
      if (fo) fo.innerHTML = '<p>Find the chords online. Copy them from the page, come back, and paste them below.</p>' + findOnlineLinks(q, true);
    }, 60);
  }

  // `original` is the text as pasted or loaded, kept with the song so a badly
  // converted sheet can be sent back for fixing.
  function applyImported(result, replaceBody, original) {
    const d = readEditForm();
    if (replaceBody) d.body = result.body;
    if (replaceBody && original) d.source = original;
    if (!d.title && result.meta.title) d.title = result.meta.title;
    if (!d.artist && result.meta.artist) d.artist = result.meta.artist;
    if (!d.key && result.meta.key) d.key = result.meta.key;
    if (!Number(d.capo) && result.meta.capo) d.capo = Number(result.meta.capo) || 0;
    renderEdit();
    if (result.converted) toast(result.chordLines ? 'Lined up ' + result.chordLines + ' chord line' + (result.chordLines === 1 ? '' : 's') : 'No chord lines found to line up');
    else toast('Chord sheet loaded');
  }

  async function saveEdit() {
    const d = readEditForm();
    if (!d.title) d.title = 'Untitled';
    const song = Object.assign(byId(state.songs, d.id) || newSong(), d);
    await saveSong(song);
    state.selectedId = song.id;
    const back = state.edit.returnTo;
    state.edit = null;
    if (back === 'perform' && state.perform) state.view = 'perform';
    else if (back === 'setlist' && state.setlistId) state.view = 'setlist';
    else { state.view = 'library'; state.tab = 'songs'; }
    render();
    toast('Saved');
  }

  // ----- Settings -----

  function renderSettings() {
    const examples = state.songs.filter((s) => s.example).length;
    app.innerHTML =
      '<div class="view">' +
        '<header class="topbar gutter">' +
          '<button class="btn ghost icon-only" data-act="home" aria-label="Back to library">' + icon('back') + '</button>' +
          '<h2>Settings &amp; backup</h2>' +
        '</header>' +
        '<div class="scroll-body gutter"><div class="narrow">' +
          '<section class="settings-sec"><h3>Suggestions and problems</h3>' +
            '<p>Got an idea for the app, or a song that didn’t paste right? Send it from here. A song that looks wrong is sent along with what you originally pasted, so it can be fixed.</p>' +
            '<div class="row-actions"><button class="btn primary" data-act="feedback">' + icon('send') + 'Send a suggestion</button></div>' +
            '<div class="field"><label for="feedback-to">Send suggestions to (email or mobile number)</label>' +
              '<input class="input" id="feedback-to" type="text" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Optional. Fills in the To line for you" value="' + esc(state.settings.feedbackTo || '') + '"></div>' +
          '</section>' +
          '<section class="settings-sec"><h3>Back up your songs</h3>' +
            '<p>Your ' + state.songs.length + ' songs and ' + state.setlists.length + ' setlists are saved on this device only. Save a backup file to Files or iCloud Drive now and then, and use it to move your library to a new iPad.</p>' +
            '<div class="row-actions"><button class="btn primary" data-act="export">' + icon('download') + 'Save backup file</button>' +
            '<label class="btn" for="restore-file">' + icon('upload') + 'Restore from backup</label><input type="file" id="restore-file" accept=".json,application/json" hidden></div>' +
          '</section>' +
          '<section class="settings-sec"><h3>Import song files</h3>' +
            '<p>Add several songs at once from text or ChordPro files (.txt, .cho, .chordpro, .pro). Chords above lyrics are lined up automatically.</p>' +
            '<div class="row-actions"><label class="btn" for="import-files">' + icon('file') + 'Choose files</label><input type="file" id="import-files" multiple accept=".txt,.cho,.chopro,.chordpro,.crd,.pro,text/plain" hidden></div>' +
          '</section>' +
          '<section class="settings-sec"><h3>Stage colours</h3>' +
            '<p>Dark is easiest on the eyes in a dim room. Light is better outdoors in sunshine.</p>' +
            '<div class="seg"><button data-act="stage" data-stage="dark" aria-pressed="' + (state.settings.stage !== 'light') + '">Dark stage</button><button data-act="stage" data-stage="light" aria-pressed="' + (state.settings.stage === 'light') + '">Daylight</button></div>' +
          '</section>' +
          '<section class="settings-sec"><h3>Foot pedal and keyboard</h3>' +
            '<p>Bluetooth page-turner pedals work once paired with the iPad. While a song is open:</p>' +
            '<div class="keys">' +
              '<span><kbd>→</kbd> <kbd>↓</kbd> <kbd>Page Down</kbd></span><span>Scroll down a screen. At the end of a song, go to the next song in the setlist.</span>' +
              '<span><kbd>←</kbd> <kbd>↑</kbd> <kbd>Page Up</kbd></span><span>Scroll back up. At the top, go to the previous song.</span>' +
              '<span><kbd>Space</kbd> <kbd>Enter</kbd></span><span>Start or pause autoscroll.</span>' +
              '<span><kbd>Esc</kbd></span><span>Close the song.</span>' +
            '</div>' +
          '</section>' +
          '<section class="settings-sec"><h3>Use it like an app</h3>' +
            '<p>In Safari on the iPad, tap Share, then Add to Home Screen. Stage Tabs then opens full screen, works with no internet, and the iPad is less likely to clear your songs.</p>' +
          '</section>' +
          '<section class="settings-sec"><h3>Finding songs online</h3>' +
            '<p>Stage Tabs opens Ultimate Guitar or Songsterr in Safari rather than downloading from them, because those sites don’t allow copying by apps and the lyrics are copyrighted. Copy the chords you want and paste them in. They are lined up for you.</p>' +
          '</section>' +
          (examples ? '<section class="settings-sec"><h3>Example songs</h3><p>' + examples + ' example songs came with the app. Remove them once you have your own.</p><div class="row-actions"><button class="btn danger" data-act="remove-examples">Remove example songs</button></div></section>' : '') +
        '</div></div>' +
      '</div>';
  }

  // ----- Performance -----

  function performList() {
    const p = state.perform;
    const sl = p && p.setlistId ? byId(state.setlists, p.setlistId) : null;
    return sl ? sl.songIds.filter((id) => byId(state.songs, id)) : null;
  }

  function openPerform(songId, setlistId, index) {
    state.perform = { songId, setlistId: setlistId || null, index: index || 0 };
    state.view = 'perform';
    render();
  }

  function renderPerform() {
    const p = state.perform;
    const song = p && byId(state.songs, p.songId);
    if (!song) { state.view = 'library'; return render(); }
    const list = performList();
    const sl = p.setlistId ? byId(state.setlists, p.setlistId) : null;
    const k = keyInfo(song);
    const nextId = list && list[p.index + 1];
    const prevId = list && list[p.index - 1];
    const next = nextId && byId(state.songs, nextId);
    const sub = [song.artist, k.shapeKey && 'Key ' + k.shapeKey, k.capo && 'Capo ' + k.capo + (k.sounding ? ' (sounds ' + k.sounding + ')' : ''), song.tempo].filter(Boolean).join(' · ');
    app.innerHTML =
      '<div class="view perform" id="perform">' +
        '<header class="pbar gutter">' +
          '<button class="btn ghost icon-only" data-act="exit-perform" aria-label="Close song">' + icon('back') + '</button>' +
          '<div class="ptitle"><div class="t">' + esc(song.title) + '</div><div class="a">' + esc(sub) + '</div></div>' +
          (list ? '<span class="set-pos">' + (p.index + 1) + ' / ' + list.length + '<span class="sr-only"> in ' + esc(sl.name) + '</span></span>' : '') +
          '<button class="btn ghost icon-only" data-act="edit-song" data-id="' + song.id + '" aria-label="Edit song">' + icon('edit') + '</button>' +
        '</header>' +
        '<main class="sheet-scroll gutter" id="sheet-scroll">' +
          renderSheet(song, { fontScale: song.fontScale || 1 }) +
          '<div class="sheet-end">' +
            (next ? '<button class="next-card" data-act="next-song">' + icon('next') + '<span><span class="eyebrow">Next up</span><span class="nt">' + esc(next.title) + '</span></span></button>'
              : (list ? '<span class="eyebrow">End of setlist</span>' : '<span class="eyebrow">End of song</span>')) +
          '</div>' +
        '</main>' +
        '<footer class="pfoot gutter">' +
          '<div class="ctl"><span class="lbl">Scroll</span>' +
            '<button class="btn icon-only" data-act="speed" data-d="-1" aria-label="Slower">' + icon('minus') + '</button>' +
            '<button class="btn primary play-btn" data-act="toggle-play" id="play-btn" aria-label="Start autoscroll">' + icon('play') + '<span class="speed" id="speed-val">' + (song.scrollLevel || SPEED_DEFAULT) + '</span></button>' +
            '<button class="btn icon-only" data-act="speed" data-d="1" aria-label="Faster">' + icon('plus') + '</button>' +
          '</div>' +
          '<div class="ctl"><span class="lbl">Size</span>' +
            '<button class="btn icon-only" data-act="font" data-d="-1" aria-label="Smaller text"><span style="font-size:.8em;font-weight:800">A</span></button>' +
            '<button class="btn icon-only" data-act="font" data-d="1" aria-label="Bigger text"><span style="font-size:1.2em;font-weight:800">A</span></button>' +
          '</div>' +
          '<div class="ctl"><span class="lbl">Key</span>' +
            '<button class="btn icon-only" data-act="transpose" data-d="-1" aria-label="Transpose down">' + icon('minus') + '</button>' +
            '<span class="val" id="tr-val">' + (k.t ? (k.t > 0 ? '+' : '') + k.t : '0') + '</span>' +
            '<button class="btn icon-only" data-act="transpose" data-d="1" aria-label="Transpose up">' + icon('plus') + '</button>' +
            '<button class="btn small" data-act="capo">Capo' + (k.capo ? ' ' + k.capo : '') + '</button>' +
          '</div>' +
          (list ? '<div class="ctl"><span class="lbl">Song</span>' +
            '<button class="btn icon-only" data-act="prev-song" aria-label="Previous song"' + (prevId ? '' : ' disabled') + '>' + icon('back') + '</button>' +
            '<button class="btn icon-only" data-act="next-song" aria-label="Next song"' + (nextId ? '' : ' disabled') + '>' + icon('next') + '</button>' +
          '</div>' : '') +
        '</footer>' +
      '</div>';
    fitTabs(app);
    requestWakeLock();
    bindSheetGestures();
  }

  function rerenderSheetKeepingPlace() {
    const sc = $('#sheet-scroll');
    const ratio = sc && sc.scrollHeight > sc.clientHeight ? sc.scrollTop / (sc.scrollHeight - sc.clientHeight) : 0;
    const wasPlaying = scroller.playing;
    renderPerform();
    const sc2 = $('#sheet-scroll');
    if (sc2) sc2.scrollTop = ratio * (sc2.scrollHeight - sc2.clientHeight);
    if (wasPlaying) startScroll();
  }

  function goSong(delta) {
    const list = performList();
    if (!list) return false;
    const i = state.perform.index + delta;
    if (i < 0 || i >= list.length) return false;
    state.perform.index = i;
    state.perform.songId = list[i];
    renderPerform();
    if (delta < 0) {
      // Going back with the pedal lands at the end of the previous song.
      const sc = $('#sheet-scroll');
      if (sc && delta < 0 && goSong.fromPedal) sc.scrollTop = sc.scrollHeight;
    }
    return true;
  }

  // ---------- Autoscroll ----------

  const scroller = { playing: false, raf: 0, last: 0, pos: 0, lastSet: -1 };

  const speedPx = (level) => 6 + (level - 1) * 4.5; // pixels per second

  function currentSong() { return state.perform && byId(state.songs, state.perform.songId); }

  function startScroll() {
    const sc = $('#sheet-scroll');
    const song = currentSong();
    if (!sc || !song) return;
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) sc.scrollTop = 0;
    scroller.playing = true;
    scroller.last = 0;
    scroller.pos = sc.scrollTop;
    scroller.lastSet = sc.scrollTop;
    cancelAnimationFrame(scroller.raf);
    const step = (ts) => {
      if (!scroller.playing) return;
      const el = $('#sheet-scroll');
      const s = currentSong();
      if (!el || !s) { stopScroll(false); return; }
      if (!scroller.last) scroller.last = ts;
      const dt = Math.min(0.1, (ts - scroller.last) / 1000);
      scroller.last = ts;
      if (Math.abs(el.scrollTop - scroller.lastSet) > 3) scroller.pos = el.scrollTop; // finger moved it
      scroller.pos += speedPx(s.scrollLevel || SPEED_DEFAULT) * dt;
      el.scrollTop = scroller.pos;
      scroller.lastSet = el.scrollTop;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { stopScroll(true); return; }
      scroller.raf = requestAnimationFrame(step);
    };
    scroller.raf = requestAnimationFrame(step);
    updatePlayUi();
  }

  function stopScroll(updateUi) {
    scroller.playing = false;
    cancelAnimationFrame(scroller.raf);
    if (updateUi !== false) updatePlayUi();
  }

  function togglePlay() {
    if (scroller.playing) stopScroll(); else startScroll();
  }

  function updatePlayUi() {
    const view = $('#perform');
    const btn = $('#play-btn');
    const song = currentSong();
    if (view) view.classList.toggle('playing', scroller.playing);
    if (btn && song) {
      btn.innerHTML = icon(scroller.playing ? 'pause' : 'play') + '<span class="speed" id="speed-val">' + (song.scrollLevel || SPEED_DEFAULT) + '</span>';
      btn.setAttribute('aria-label', scroller.playing ? 'Pause autoscroll' : 'Start autoscroll');
    }
  }

  function pageBy(dir) {
    const sc = $('#sheet-scroll');
    if (!sc) return;
    const atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
    const atTop = sc.scrollTop <= 2;
    if (dir > 0 && atEnd) { if (goSong(1)) return; }
    if (dir < 0 && atTop) { goSong.fromPedal = true; const moved = goSong(-1); goSong.fromPedal = false; if (moved) return; }
    const amount = dir * Math.round(sc.clientHeight * 0.8);
    if (scroller.playing) { scroller.pos = clamp(scroller.pos + amount, 0, sc.scrollHeight); sc.scrollTop = scroller.pos; scroller.lastSet = sc.scrollTop; }
    else sc.scrollBy({ top: amount, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // ---------- Wake lock ----------

  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.view === 'perform') requestWakeLock();
    if (document.visibilityState === 'hidden') stopScroll();
  });

  // ---------- Gestures on the sheet ----------

  function bindSheetGestures() {
    const sc = $('#sheet-scroll');
    if (!sc) return;
    let sx = 0, sy = 0, st = 0;
    sc.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    sc.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st < 600 && Math.abs(dx) > 80 && Math.abs(dy) < 60) {
        if (dx < 0) goSong(1); else goSong(-1);
      }
    }, { passive: true });
    // A tap on the sheet (not a scroll) starts or pauses autoscroll.
    sc.addEventListener('click', (e) => {
      if (e.target.closest('button, a, pre')) return;
      togglePlay();
    });
  }

  // ---------- Modals ----------

  function openModal(html, onReady) {
    modalRoot.innerHTML = '<div class="modal-backdrop" data-act="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    const m = $('.modal', modalRoot);
    if (onReady) onReady(m);
    const first = m.querySelector('input, button');
    if (first) first.focus();
    return m;
  }
  function closeModal() { modalRoot.innerHTML = ''; }

  function confirmBox(title, message, okLabel, danger) {
    return new Promise((resolve) => {
      openModal('<header><h3>' + esc(title) + '</h3></header><div class="modal-body">' + esc(message) + '</div>' +
        '<footer><button class="btn" id="m-cancel">Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" id="m-ok">' + esc(okLabel) + '</button></footer>', (m) => {
        m.querySelector('#m-cancel').onclick = () => { closeModal(); resolve(false); };
        m.querySelector('#m-ok').onclick = () => { closeModal(); resolve(true); };
      });
    });
  }

  function songPicker(sl) {
    const inSet = new Set(sl.songIds);
    const songs = state.songs.slice().sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));
    openModal('<header><h3>Add songs to “' + esc(sl.name) + '”</h3></header>' +
      '<div class="modal-body"><div class="search" style="margin-bottom:8px">' + icon('search') + '<label class="sr-only" for="pick-q">Search</label><input id="pick-q" class="input" type="search" placeholder="Search" autocomplete="off"></div>' +
      '<div id="pick-list">' + songs.map((s) =>
        '<label class="pick-row" data-search="' + esc(sortKey(s.title + ' ' + s.artist)) + '"><input type="checkbox" value="' + s.id + '"' + (inSet.has(s.id) ? ' checked disabled' : '') + '>' +
        '<span class="row-main"><span class="row-title">' + esc(s.title) + '</span><span class="row-sub">' + esc(s.artist) + (inSet.has(s.id) ? ' · already in setlist' : '') + '</span></span></label>').join('') + '</div></div>' +
      '<footer><button class="btn" id="m-cancel">Cancel</button><button class="btn primary" id="m-ok">Add to setlist</button></footer>', (m) => {
      m.querySelector('#pick-q').addEventListener('input', (e) => {
        const q = sortKey(e.target.value);
        m.querySelectorAll('.pick-row').forEach((r) => { r.hidden = q && !r.dataset.search.includes(q); });
      });
      m.querySelector('#m-cancel').onclick = closeModal;
      m.querySelector('#m-ok').onclick = async () => {
        const ids = [...m.querySelectorAll('input[type=checkbox]:checked:not(:disabled)')].map((i) => i.value);
        sl.songIds.push(...ids);
        await saveSetlist(sl);
        closeModal();
        render();
        if (ids.length) toast('Added ' + ids.length + ' song' + (ids.length === 1 ? '' : 's'));
      };
    });
  }

  function setlistChooser(songId) {
    const song = byId(state.songs, songId);
    openModal('<header><h3>Add “' + esc(song.title) + '” to a setlist</h3></header><div class="modal-body">' +
      state.setlists.map((sl) => '<button class="capo-row" data-pick="' + sl.id + '"><span class="shapes" style="color:var(--fg)">' + esc(sl.name) + '</span><span class="chip">' + sl.songIds.length + '</span></button>').join('') +
      '<form id="m-new" class="new-set"><label class="sr-only" for="m-new-name">New setlist name</label><input class="input" id="m-new-name" placeholder="Or start a new setlist"><button class="btn" type="submit">Create</button></form>' +
      '</div><footer><button class="btn" id="m-cancel">Close</button></footer>', (m) => {
      m.querySelector('#m-cancel').onclick = closeModal;
      m.querySelectorAll('[data-pick]').forEach((b) => {
        b.onclick = async () => {
          const sl = byId(state.setlists, b.dataset.pick);
          if (!sl.songIds.includes(songId)) sl.songIds.push(songId);
          await saveSetlist(sl);
          closeModal();
          toast('Added to ' + sl.name);
        };
      });
      m.querySelector('#m-new').onsubmit = async (e) => {
        e.preventDefault();
        const name = m.querySelector('#m-new-name').value.trim();
        if (!name) return;
        const sl = { id: uid('l'), name, songIds: [songId] };
        await saveSetlist(sl);
        closeModal();
        toast('Added to ' + name);
      };
    });
  }

  function capoHelper() {
    const song = currentSong();
    if (!song) return;
    const chords = CP.chordsIn(song.body);
    const total = (song.transpose || 0) + (Number(song.capo) || 0);
    const opts = CP.capoOptions(chords, song.key, total);
    const best = opts.reduce((a, b) => (b.score > a.score + 0.001 ? b : a), opts[0]);
    const sounding = song.key ? CP.transposeKey(song.key, total) : '';
    const curCapo = Number(song.capo) || 0;
    openModal('<header><h3>Capo</h3></header><div class="modal-body">' +
      '<p style="margin-top:0">Same sound, different chord shapes' + (sounding ? '. The song sounds in <b style="color:var(--fg)">' + esc(sounding) + '</b>' : '') + '. Pick where to put the capo and the chords change to match.</p>' +
      opts.map((o) => {
        const shapes = [...new Set(chords.map(CP.makeTransposer(song.key, o.shift, chords)))].slice(0, 6).join(' ');
        return '<button class="capo-row" data-capo="' + o.capo + '"' + (o.capo === curCapo ? ' aria-current="true"' : '') + '>' +
          '<span class="cp">' + (o.capo ? 'Fret ' + o.capo : 'No capo') + '</span>' +
          '<span class="shapes">' + (o.shapesKey ? 'Play in <b>' + esc(o.shapesKey) + '</b> · ' : '') + esc(shapes) + '</span>' +
          (o === best && best.score > 0 ? '<span class="best">Easiest</span>' : '') +
          '<span class="ease" title="How many open chords"><i style="width:' + Math.round(o.score * 100) + '%"></i></span>' +
        '</button>';
      }).join('') + '</div>' +
      '<footer><button class="btn" id="m-reset">Back to original key</button><button class="btn primary" id="m-cancel">Done</button></footer>', (m) => {
      m.querySelector('#m-cancel').onclick = closeModal;
      m.querySelector('#m-reset').onclick = () => {
        song.transpose = 0;
        saveSongPrefsSoon(song);
        closeModal();
        rerenderSheetKeepingPlace();
      };
      m.querySelectorAll('[data-capo]').forEach((b) => {
        b.onclick = () => {
          const c = Number(b.dataset.capo);
          song.transpose = normSteps(total - c);
          song.capo = c;
          saveSongPrefsSoon(song);
          closeModal();
          rerenderSheetKeepingPlace();
        };
      });
    });
  }

  const normSteps = (n) => ((((n + 6) % 12) + 12) % 12) - 6;

  // ---------- Suggestions ----------

  function deviceName() {
    const ua = navigator.userAgent;
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Other device';
  }

  const FEEDBACK_KINDS = { idea: 'Idea', problem: 'Something’s not working', song: 'Song looks wrong' };

  function composeFeedback(kind, message, song) {
    const lines = ['Stage Tabs: ' + FEEDBACK_KINDS[kind], '', message.trim() || '(no message)'];
    if (song) {
      lines.push('', '=== Song: ' + (song.title || 'Untitled') + (song.artist ? ' by ' + song.artist : '') + ' ===');
      if (song.key || Number(song.capo)) lines.push([song.key && 'Key ' + song.key, Number(song.capo) && 'Capo ' + song.capo].filter(Boolean).join(', '));
      lines.push('', '--- How it shows in the app ---', song.body || '(empty)');
      if (song.source && song.source.trim() !== (song.body || '').trim()) lines.push('', '--- As originally pasted ---', song.source);
    }
    lines.push('', '---', 'Stage Tabs ' + APP_VERSION + ' on ' + deviceName());
    return lines.join('\n');
  }

  function feedbackLink(to, subject, body) {
    const dest = String(to || '').trim();
    const phone = dest.replace(/[\s()-]/g, '');
    if (/^\+?\d{6,}$/.test(phone)) return 'sms:' + phone + '&body=' + encodeURIComponent(subject + '\n\n' + body);
    return 'mailto:' + dest.replace(/\s/g, '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function feedbackModal(song) {
    let kind = song ? 'song' : 'idea';
    const canShare = !!navigator.share;
    const to = (state.settings.feedbackTo || '').trim();
    openModal('<header><h3>Send a suggestion</h3></header><div class="modal-body">' +
      '<div class="seg" style="margin-bottom:12px;flex-wrap:wrap">' +
        Object.keys(FEEDBACK_KINDS).filter((k) => k !== 'song' || song).map((k) =>
          '<button data-kind="' + k + '" aria-pressed="' + (k === kind) + '">' + FEEDBACK_KINDS[k] + '</button>').join('') +
      '</div>' +
      '<div class="field"><label for="fb-msg">Your message</label>' +
        '<textarea class="input" id="fb-msg" rows="5" placeholder="' + (song ? 'What looks wrong? e.g. the chords in the chorus are shifted' : 'What would make the app better?') + '"></textarea></div>' +
      (song ? '<p style="margin:10px 0 0">“' + esc(song.title || 'Untitled') + '” is attached' + (song.source ? ', with what you originally pasted' : '') + '.</p>' : '') +
      '<p style="margin:10px 0 0">' + (to ? 'Goes to ' + esc(to) + '.' : 'You choose who to send it to. You can save an address in Settings.') + '</p>' +
      '</div><footer>' +
        '<button class="btn" id="fb-copy">Copy</button>' +
        (canShare ? '<button class="btn" id="fb-share">Share…</button>' : '') +
        '<button class="btn primary" id="fb-send">' + (/^\+?[\d\s()-]{6,}$/.test(to) ? 'Text it' : 'Email it') + '</button>' +
      '</footer>', (m) => {
      const msg = m.querySelector('#fb-msg');
      const text = () => composeFeedback(kind, msg.value, song);
      const subject = () => 'Stage Tabs: ' + FEEDBACK_KINDS[kind] + (song && kind === 'song' ? ' (' + (song.title || 'Untitled') + ')' : '');
      m.querySelectorAll('[data-kind]').forEach((b) => {
        b.onclick = () => {
          kind = b.dataset.kind;
          m.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        };
      });
      m.querySelector('#fb-send').onclick = () => {
        window.location.href = feedbackLink(to, subject(), text());
        closeModal();
      };
      const share = m.querySelector('#fb-share');
      if (share) share.onclick = async () => {
        try { await navigator.share({ title: subject(), text: text() }); closeModal(); toast('Thanks for the suggestion'); }
        catch (e) { if (!e || e.name !== 'AbortError') toast('Couldn’t open sharing. Try Copy instead.'); }
      };
      m.querySelector('#fb-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(text()); closeModal(); toast('Copied. Paste it into a message or email.'); }
        catch (e) { msg.value = text(); msg.select(); toast('Select all and copy the text in the box'); }
      };
      msg.focus();
    });
  }

  // ---------- Backup ----------

  async function exportBackup() {
    if (window.__STAGE_TABS_PREVIEW__) { toast('Backups can be saved from the installed app, not from this preview.'); return; }
    const data = JSON.stringify({ app: 'stage-tabs', version: 1, exportedAt: new Date().toISOString(), songs: state.songs, setlists: state.setlists }, null, 1);
    const name = 'stage-tabs-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      const file = new File([data], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Stage Tabs backup' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    try {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Backup saved as ' + name);
    } catch (e) {
      toast('Couldn’t save the file here. Open Stage Tabs from your home screen and try again.');
    }
  }

  async function restoreBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.songs)) throw new Error('not a backup');
      const ok = await confirmBox('Restore backup?', 'This adds ' + data.songs.length + ' songs and ' + (data.setlists || []).length + ' setlists from the file. Songs that are already here get replaced by the copy in the backup.', 'Restore');
      if (!ok) return;
      const songs = data.songs.filter((s) => s && s.id).map((s) => newSong(s));
      const lists = (data.setlists || []).filter((s) => s && s.id && Array.isArray(s.songIds));
      await Store.putMany('songs', songs);
      await Store.putMany('setlists', lists);
      state.songs = await Store.getAll('songs');
      state.setlists = await Store.getAll('setlists');
      render();
      toast('Restored ' + songs.length + ' songs');
    } catch (e) {
      toast('That file isn’t a Stage Tabs backup.');
    }
  }

  async function importSongFiles(files) {
    let n = 0;
    for (const f of files) {
      if (/\.json$/i.test(f.name)) { await restoreBackup(f); continue; }
      const raw = await f.text();
      const r = CP.importText(raw, f.name);
      await saveSong(newSong({ title: r.meta.title || 'Untitled', artist: r.meta.artist || '', key: r.meta.key || '', capo: Number(r.meta.capo) || 0, body: r.body, source: raw }));
      n++;
    }
    if (n) toast('Imported ' + n + ' song' + (n === 1 ? '' : 's'));
    render();
  }

  // ---------- Events ----------

  app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    const id = el.dataset.id;
    const song = currentSong();
    switch (act) {
      case 'tab': state.tab = el.dataset.tab; render(); break;
      case 'sort':
        state.sort = el.dataset.sort; Store.setMeta('sort', state.sort);
        document.querySelectorAll('[data-act="sort"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
        updateList(); break;
      case 'jump': {
        const g = document.querySelector('.group[data-letter="' + el.dataset.letter + '"]');
        if (g) $('#list').scrollTop = g.offsetTop - $('#list').offsetTop;
        break;
      }
      case 'open-song':
        if (window.matchMedia('(min-width: 900px)').matches) {
          state.selectedId = id;
          document.querySelectorAll('.song-row').forEach((r) => {
            if (r.dataset.id === id) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
          });
          updatePreview();
        } else {
          state.selectedId = id; openPerform(id);
        }
        break;
      case 'perform': openPerform(id); break;
      case 'settings': state.view = 'settings'; render(); break;
      case 'home': state.view = 'library'; render(); break;
      case 'new-song': startEdit(newSong(), true, 'library'); break;
      case 'new-song-from-query': startEdit(newSong({ title: state.query.trim() }), true, 'library'); break;
      case 'edit-song': stopScroll(); startEdit(byId(state.songs, id), false, state.view); break;
      case 'add-to-setlist': setlistChooser(id); break;
      case 'focus-new-set': { const i = $('#new-set-name'); if (i) i.focus(); break; }
      case 'open-setlist': state.setlistId = id; state.view = 'setlist'; render(); break;

      // Setlist detail
      case 'add-songs-to-set': songPicker(byId(state.setlists, state.setlistId)); break;
      case 'play-set': case 'play-set-at': {
        const sl = byId(state.setlists, state.setlistId);
        const ids = sl.songIds.filter((x) => byId(state.songs, x));
        const i = act === 'play-set-at' ? Number(el.dataset.index) : 0;
        if (ids[i]) openPerform(ids[i], sl.id, i);
        break;
      }
      case 'set-move': case 'set-remove': {
        const sl = byId(state.setlists, state.setlistId);
        sl.songIds = sl.songIds.filter((x) => byId(state.songs, x));
        const i = Number(el.dataset.index);
        if (act === 'set-remove') sl.songIds.splice(i, 1);
        else {
          const j = i + Number(el.dataset.dir);
          if (j < 0 || j >= sl.songIds.length) break;
          [sl.songIds[i], sl.songIds[j]] = [sl.songIds[j], sl.songIds[i]];
        }
        await saveSetlist(sl); render(); break;
      }
      case 'delete-setlist': {
        const sl = byId(state.setlists, state.setlistId);
        if (await confirmBox('Delete “' + sl.name + '”?', 'The songs stay in your library.', 'Delete setlist', true)) {
          state.setlists = state.setlists.filter((x) => x.id !== sl.id);
          await Store.remove('setlists', sl.id);
          state.view = 'library'; state.tab = 'setlists'; render();
        }
        break;
      }

      // Editor
      case 'cancel-edit': {
        const back = state.edit.returnTo;
        state.edit = null;
        state.view = back === 'perform' && state.perform ? 'perform' : back === 'setlist' ? 'setlist' : back === 'settings' ? 'settings' : 'library';
        render(); break;
      }
      case 'save-edit': saveEdit(); break;
      case 'ed-pane': readEditForm(); state.edit.pane = el.dataset.pane; renderEdit(); break;
      case 'convert': {
        const d = readEditForm();
        if (!d.body.trim()) { toast('Paste a chord sheet first'); break; }
        if (CP.looksLikeChordPro(d.body)) { toast('Chords are already lined up'); break; }
        applyImported(CP.importText(d.body), true, d.body);
        break;
      }
      case 'paste-example': applyImported(CP.importText(window.Seed.pasteExample), true, window.Seed.pasteExample); break;
      case 'delete-song': {
        const d = state.edit.draft;
        if (await confirmBox('Delete “' + (d.title || 'Untitled') + '”?', 'It will be removed from your library and from any setlists.', 'Delete song', true)) {
          await deleteSong(d.id);
          state.edit = null; state.view = 'library'; state.perform = null; render();
          toast('Song deleted');
        }
        break;
      }

      // Settings
      case 'export': exportBackup(); break;
      case 'feedback': feedbackModal(null); break;
      case 'feedback-song': feedbackModal(Object.assign({}, readEditForm())); break;
      case 'stage':
        state.settings.stage = el.dataset.stage; applyStage(); Store.setMeta('settings', state.settings); render(); break;
      case 'remove-examples':
        if (await confirmBox('Remove example songs?', 'The example songs and example setlist will be deleted. Your own songs are not touched.', 'Remove examples', true)) {
          for (const s of state.songs.filter((x) => x.example)) await deleteSong(s.id);
          for (const sl of state.setlists.filter((x) => x.example)) { await Store.remove('setlists', sl.id); }
          state.setlists = state.setlists.filter((x) => !x.example);
          render(); toast('Example songs removed');
        }
        break;

      // Performance
      case 'exit-perform': {
        stopScroll(); releaseWakeLock();
        const fromSet = state.perform && state.perform.setlistId;
        state.view = fromSet ? 'setlist' : 'library';
        if (fromSet) state.setlistId = fromSet;
        render(); break;
      }
      case 'toggle-play': togglePlay(); break;
      case 'speed':
        if (song) {
          song.scrollLevel = clamp((song.scrollLevel || SPEED_DEFAULT) + Number(el.dataset.d), SPEED_MIN, SPEED_MAX);
          saveSongPrefsSoon(song); updatePlayUi();
        }
        break;
      case 'font':
        if (song) {
          song.fontScale = Math.round(clamp((song.fontScale || 1) + Number(el.dataset.d) * 0.1, FONT_MIN, FONT_MAX) * 10) / 10;
          saveSongPrefsSoon(song);
          const sheet = $('#sheet-scroll .sheet');
          if (sheet) { sheet.style.setProperty('--fs', song.fontScale); fitTabs(sheet); }
        }
        break;
      case 'transpose':
        if (song) { song.transpose = normSteps((song.transpose || 0) + Number(el.dataset.d)); saveSongPrefsSoon(song); rerenderSheetKeepingPlace(); }
        break;
      case 'capo': capoHelper(); break;
      case 'next-song': goSong(1); break;
      case 'prev-song': goSong(-1); break;
      default: break;
    }
  });

  modalRoot.addEventListener('click', (e) => {
    if (e.target.matches('[data-act="modal-backdrop"]')) closeModal();
  });

  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { state.query = t.value; updateList(); }
    else if (state.view === 'edit' && t.closest('.edit-form')) updateEditPreview();
  });

  app.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'feedback-to') {
      state.settings.feedbackTo = t.value.trim();
      Store.setMeta('settings', state.settings);
      toast(state.settings.feedbackTo ? 'Suggestions will go to ' + state.settings.feedbackTo : 'Address cleared');
    } else if (t.id === 'set-name') {
      const sl = byId(state.setlists, state.setlistId);
      if (sl && t.value.trim()) { sl.name = t.value.trim(); await saveSetlist(sl); renderSetlist(); }
    } else if (t.id === 'ed-file' && t.files[0]) {
      const f = t.files[0];
      const raw = await f.text();
      applyImported(CP.importText(raw, f.name), true, raw);
    } else if (t.id === 'restore-file' && t.files[0]) {
      restoreBackup(t.files[0]);
    } else if (t.id === 'import-files' && t.files.length) {
      importSongFiles([...t.files]);
    }
  });

  app.addEventListener('submit', async (e) => {
    if (e.target.id !== 'new-set-form') return;
    e.preventDefault();
    const name = $('#new-set-name').value.trim();
    if (!name) { $('#new-set-name').focus(); return; }
    const sl = { id: uid('l'), name, songIds: [] };
    await saveSetlist(sl);
    state.setlistId = sl.id; state.view = 'setlist'; render();
  });

  // Pasting into an empty chord box lines up the chords straight away.
  app.addEventListener('paste', (e) => {
    const t = e.target;
    if (t.id !== 'ed-body') return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const replacingAll = !t.value.trim() || (t.selectionStart === 0 && t.selectionEnd === t.value.length);
    if (!text || !replacingAll) return;
    e.preventDefault();
    applyImported(CP.importText(text), true, text);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (modalRoot.firstChild) { if (e.key === 'Escape') closeModal(); return; }
    if (state.view !== 'perform') return;
    switch (e.key) {
      case 'ArrowDown': case 'PageDown': case 'ArrowRight': e.preventDefault(); pageBy(1); break;
      case 'ArrowUp': case 'PageUp': case 'ArrowLeft': e.preventDefault(); pageBy(-1); break;
      case ' ': case 'Enter': case 'Spacebar': e.preventDefault(); togglePlay(); break;
      case 'Escape': $('[data-act="exit-perform"]').click(); break;
      default: break;
    }
  });

  let lastWide = window.matchMedia('(min-width: 900px)').matches;
  window.addEventListener('resize', () => {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (wide !== lastWide && state.view === 'library') { lastWide = wide; render(); }
    else fitTabs(app);
    lastWide = wide;
  });

  // ---------- Start ----------

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.__STAGE_TABS_PREVIEW__) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  loadAll().then(render, (err) => {
    app.innerHTML = '<div class="empty"><strong>Stage Tabs couldn’t start</strong><span>' + esc(err && err.message) + '</span></div>';
  });

  // Exposed for automated tests.
  window.StageTabs = { state, render, renderSheet, composeFeedback, feedbackLink };
})();
