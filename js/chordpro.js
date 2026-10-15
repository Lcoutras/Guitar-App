/*
 * Chord sheet engine: parses ChordPro, converts "chords on the line above the
 * lyrics" text (what you copy from most tab sites) into ChordPro, and
 * transposes chords. No DOM access, so it runs in the browser and in Node tests.
 */
(function (root) {
  'use strict';

  const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const NOTE_INDEX = { 'B#': 0, 'E#': 5, Cb: 11, Fb: 4 };
  SHARPS.forEach((n, i) => { NOTE_INDEX[n] = i; });
  FLATS.forEach((n, i) => { NOTE_INDEX[n] = i; });

  // How each key is usually spelled, by root index.
  const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const MAJOR_FLAT = [false, true, false, true, false, true, false, false, true, false, true, false];
  const MINOR_FLAT = [true, false, true, true, false, true, false, true, false, false, true, false];

  const CHORD_RE = /^[A-G][#b]?(?:maj|min|mi|m|M|dim|aug|sus|add|°|ø|\+|-)?\d*(?:(?:maj|min|sus|add|dim|aug|no|b|#|\+|-|\/)?\d+)*(?:sus|aug|dim|\+)?(?:\([^)]*\))?(?:\/[A-G][#b]?)?\*?$/;
  const NOISE_RE = /^(?:\|+:?|:?\|+|-+|~+|x\d+|\d+x|\(x?\d+x?\)|\(|\)|N\.?C\.?|%|\/+|\.+|\*+)$/i;
  const NC_RE = /^N\.?C\.?$/i;
  const SECTION_WORDS = 'intro|verse|chorus|pre-?chorus|post-?chorus|bridge|outro|solo|interlude|instrumental|refrain|coda|tag|hook|break|ending|riff|middle 8';
  const SECTION_RE = new RegExp('^\\s*\\[?((?:' + SECTION_WORDS + ')(?:\\s*\\d+)?(?:\\s*\\(.*\\))?)\\]?\\s*:?\\s*$', 'i');
  const SECTION_WITH_CHORDS_RE = new RegExp('^\\s*\\[?((?:' + SECTION_WORDS + ')(?:\\s*\\d+)?)\\]?\\s*:\\s*(.+)$', 'i');

  function normalizeAccidentals(s) {
    return s.replace(/♯/g, '#').replace(/♭/g, 'b');
  }

  function isChord(token) {
    let t = normalizeAccidentals(token);
    if (t.length > 1 && t[0] === '(' && t[t.length - 1] === ')') t = t.slice(1, -1);
    return CHORD_RE.test(t);
  }

  // Notes written in brackets on a chord line, like "(let ring)" or "(x2)", are
  // blanked out (keeping column positions) so the line still counts as chords.
  function splitNotes(line) {
    const notes = [];
    const rest = line.replace(/\([^()]*\)/g, (m) => {
      if (isChord(m)) return m;
      notes.push(m);
      return ' '.repeat(m.length);
    });
    return { rest, notes };
  }

  function isChordLine(line) {
    const tokens = splitNotes(line).rest.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    let chords = 0;
    for (const tok of tokens) {
      if (isChord(tok) || NC_RE.test(tok)) chords++;
      else if (!NOISE_RE.test(tok)) return false;
    }
    return chords > 0;
  }

  function isTabLine(line) {
    const t = line.trim();
    if (!/^[A-Ga-g][#b]?\s*[|:]/.test(t) && !/^\|[-0-9]/.test(t)) return false;
    return (t.match(/-/g) || []).length >= 4 && /^[A-Ga-g#b|:\s0-9\-xXhpbrsv\/\\~().^*=+<>]+$/.test(t);
  }

  function sectionLabel(line) {
    const m = line.match(SECTION_RE);
    if (!m) return null;
    const label = m[1].trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function expandTabs(line) {
    if (line.indexOf('\t') < 0) return line;
    let out = '';
    for (const ch of line) {
      if (ch === '\t') out += ' '.repeat(8 - (out.length % 8));
      else out += ch;
    }
    return out;
  }

  // ---------- Transposing ----------

  function parseChordParts(chord) {
    const c = normalizeAccidentals(chord);
    let m = c.match(/^([A-G][#b]?)([^/]*)\/([A-G][#b]?)$/);
    if (m) return { root: m[1], rest: m[2], bass: m[3] };
    m = c.match(/^([A-G][#b]?)(.*)$/);
    if (m) return { root: m[1], rest: m[2], bass: null };
    return null;
  }

  function noteName(index, useFlats) {
    const i = ((index % 12) + 12) % 12;
    return useFlats ? FLATS[i] : SHARPS[i];
  }

  function transposeNote(note, steps, useFlats) {
    const idx = NOTE_INDEX[note];
    if (idx === undefined) return note;
    return noteName(idx + steps, useFlats);
  }

  function transposeChord(chord, steps, useFlats) {
    if (!chord) return chord;
    let wrapOpen = '', wrapClose = '', core = chord;
    if (core.length > 1 && core[0] === '(' && core[core.length - 1] === ')') {
      wrapOpen = '('; wrapClose = ')'; core = core.slice(1, -1);
    }
    const parts = parseChordParts(core);
    if (!parts) return chord;
    const s = ((steps % 12) + 12) % 12;
    if (s === 0 && useFlats === undefined) return chord;
    const flats = useFlats === undefined ? parts.root.length > 1 && parts.root[1] === 'b' : useFlats;
    let out = transposeNote(parts.root, s, flats) + parts.rest;
    if (parts.bass) out += '/' + transposeNote(parts.bass, s, flats);
    return wrapOpen + out + wrapClose;
  }

  function parseKey(key) {
    if (!key) return null;
    const m = normalizeAccidentals(String(key).trim()).match(/^([A-G][#b]?)\s*(m|min|minor)?\b/i);
    if (!m) return null;
    const idx = NOTE_INDEX[m[1].charAt(0).toUpperCase() + m[1].slice(1)];
    if (idx === undefined) return null;
    return { index: idx, minor: !!m[2] };
  }

  function keyName(index, minor) {
    const i = ((index % 12) + 12) % 12;
    return minor ? MINOR_NAMES[i] + 'm' : MAJOR_NAMES[i];
  }

  function transposeKey(key, steps) {
    const k = parseKey(key);
    if (!k) return key || '';
    return keyName(k.index + steps, k.minor);
  }

  function keyUsesFlats(index, minor) {
    const i = ((index % 12) + 12) % 12;
    return minor ? MINOR_FLAT[i] : MAJOR_FLAT[i];
  }

  // Best guess at a song's key when none is given: its first chord.
  function guessKey(chords) {
    for (const c of chords) {
      const p = parseChordParts(c);
      if (p && NOTE_INDEX[p.root] !== undefined) {
        const minor = /^m(?!aj)/.test(p.rest) || /^min/.test(p.rest);
        return keyName(NOTE_INDEX[p.root], minor);
      }
    }
    return '';
  }

  // Returns a function that maps a written chord to the chord to display.
  function makeTransposer(songKey, steps, chords) {
    const s = ((steps % 12) + 12) % 12;
    if (s === 0) return (c) => c;
    const k = parseKey(songKey) || parseKey(guessKey(chords || []));
    const flats = k ? keyUsesFlats(k.index + s, k.minor) : false;
    return (c) => transposeChord(c, s, flats);
  }

  // ---------- Capo helper ----------

  const EASY = new Set(['C', 'D', 'E', 'G', 'A', 'Am', 'Em', 'Dm', 'E7', 'A7', 'D7', 'G7', 'C7', 'B7',
    'Am7', 'Em7', 'Dm7', 'Cmaj7', 'Dmaj7', 'Fmaj7', 'Gmaj7', 'Amaj7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4',
    'Esus4', 'Cadd9', 'G6', 'D6', 'A6', 'E5', 'A5', 'D5', 'G5', 'Em9', 'Am9']);

  function easeScore(chords) {
    const unique = [...new Set(chords.map((c) => c.split('/')[0]))].filter((c) => parseChordParts(c));
    if (!unique.length) return 0;
    return unique.filter((c) => EASY.has(c)).length / unique.length;
  }

  // Shapes to play for each capo position (0-7) that keep the same sounding pitch.
  // `soundingShift` = transpose + capo; shapes = written + soundingShift - capoPosition.
  function capoOptions(chords, songKey, soundingShift) {
    const out = [];
    for (let capo = 0; capo <= 7; capo++) {
      const shift = soundingShift - capo;
      const tr = makeTransposer(songKey, shift, chords);
      const shapes = chords.map(tr);
      const k = parseKey(songKey) || parseKey(guessKey(chords));
      out.push({
        capo,
        shift,
        score: easeScore(shapes),
        shapesKey: k ? keyName(k.index + shift, k.minor) : guessKey(shapes),
      });
    }
    return out;
  }

  // ---------- ChordPro parsing ----------

  const DIRECTIVE_RE = /^\s*\{\s*([a-zA-Z_-]+)\s*(?:[:\s]\s*([\s\S]*?))?\s*\}\s*$/;

  function parseLyricLine(line) {
    const segs = [];
    const re = /\[([^\]]*)\]/g;
    let last = 0, chord = '', m, hasChords = false;
    while ((m = re.exec(line))) {
      if (m.index > last || chord) segs.push({ c: chord, t: line.slice(last, m.index) });
      chord = m[1].trim();
      hasChords = true;
      last = re.lastIndex;
    }
    if (last < line.length || chord) segs.push({ c: chord, t: line.slice(last) });
    if (!segs.length) segs.push({ c: '', t: line });
    // Drop a leading empty, chordless segment.
    if (segs.length > 1 && !segs[0].c && !segs[0].t) segs.shift();
    return { type: 'line', segs, hasChords };
  }

  function parse(text) {
    const meta = { title: '', artist: '', key: '', capo: '', tempo: '' };
    const items = [];
    let inTab = null;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    for (const raw of lines) {
      const line = expandTabs(raw);
      const d = line.match(DIRECTIVE_RE);
      if (inTab) {
        if (d && /^(eot|end_of_tab)$/i.test(d[1])) { items.push(inTab); inTab = null; }
        else inTab.lines.push(line);
        continue;
      }
      if (d) {
        const name = d[1].toLowerCase();
        const val = (d[2] || '').trim();
        switch (name) {
          case 'title': case 't': meta.title = val; break;
          case 'subtitle': case 'st': case 'artist': meta.artist = meta.artist || val; break;
          case 'key': meta.key = val; break;
          case 'capo': meta.capo = val; break;
          case 'tempo': meta.tempo = val; break;
          case 'comment': case 'c': case 'comment_italic': case 'ci': case 'highlight': case 'comment_box': case 'cb':
            items.push({ type: 'label', text: val }); break;
          case 'start_of_chorus': case 'soc':
            items.push({ type: 'start', kind: 'chorus', label: val || 'Chorus' }); break;
          case 'start_of_verse': case 'sov':
            items.push({ type: 'start', kind: 'verse', label: val }); break;
          case 'start_of_bridge': case 'sob':
            items.push({ type: 'start', kind: 'bridge', label: val || 'Bridge' }); break;
          case 'end_of_chorus': case 'eoc': case 'end_of_verse': case 'eov': case 'end_of_bridge': case 'eob':
            items.push({ type: 'end' }); break;
          case 'chorus':
            items.push({ type: 'label', text: val || 'Chorus', repeat: true }); break;
          case 'start_of_tab': case 'sot':
            inTab = { type: 'tab', label: val, lines: [] }; break;
          default: break; // Unknown directives are ignored.
        }
        continue;
      }
      if (/^#/.test(line)) continue;
      if (!line.trim()) { items.push({ type: 'blank' }); continue; }
      items.push(parseLyricLine(line.replace(/\s+$/, '')));
    }
    if (inTab) items.push(inTab);
    return { meta, items };
  }

  function chordsIn(text) {
    const out = [];
    const { items } = parse(text);
    for (const it of items) if (it.type === 'line') for (const s of it.segs) if (s.c) out.push(s.c);
    return out;
  }

  // ---------- Converting pasted chord sheets ----------

  function looksLikeChordPro(text) {
    return /\[[A-G][#b♯♭]?[^\]\s]{0,8}\][^\n]*\S/.test(text) || /^\s*\{\s*(title|t|soc|start_of_chorus|c|comment)\s*[:}]/im.test(text);
  }

  function mergeChordsIntoLyric(chordLine, lyric) {
    const { rest, notes } = splitNotes(chordLine);
    const chords = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(rest))) {
      const tok = m[0];
      if (isChord(tok) || NC_RE.test(tok)) chords.push({ pos: m.index, chord: normalizeAccidentals(tok) });
      else if (/^(x\d+|\d+x)$/i.test(tok)) notes.push('(' + tok + ')');
    }
    if (!chords.length) return lyric;
    let out = lyric;
    const maxPos = chords[chords.length - 1].pos;
    if (out.length < maxPos) out = out.padEnd(maxPos, ' ');
    for (let i = chords.length - 1; i >= 0; i--) {
      const { pos, chord } = chords[i];
      out = out.slice(0, pos) + '[' + chord + ']' + out.slice(pos);
    }
    out = out.replace(/\s+$/, '');
    // Keep repeat counts and playing notes, at the end of the line.
    return notes.length ? out + '  ' + notes.join(' ') : out;
  }

  // Some sites copy with an empty line after every line, which separates
  // chords from their lyrics. Undo that when nearly every line is isolated.
  function undoDoubleSpacing(lines) {
    const filled = lines.map((l) => !!l.trim());
    const n = filled.filter(Boolean).length;
    if (n < 6) return lines;
    let isolated = 0;
    filled.forEach((f, i) => { if (f && !filled[i - 1] && !filled[i + 1]) isolated++; });
    if (isolated / n < 0.7) return lines;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (filled[i]) { out.push(lines[i]); continue; }
      let j = i;
      while (j < lines.length && !filled[j]) j++;
      if (j - i >= 2) out.push(''); // a real gap between sections
      i = j - 1;
    }
    return out;
  }

  function cleanPasted(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/\[\/?ch\]/g, '')      // Ultimate Guitar editor markup
      .replace(/\[\/?tab\]/g, '')
      .replace(/[​‎‏﻿]/g, '')
      .split('\n').map((l) => expandTabs(l).replace(/\s+$/, '')).join('\n');
  }

  // Converts chords-above-lyrics text to ChordPro. Returns { body, meta, stats }.
  function convert(text) {
    const lines = undoDoubleSpacing(cleanPasted(text).split('\n'));
    const meta = { title: '', artist: '', key: '', capo: '' };
    const out = [];
    let merged = 0;

    // A heading such as "Song Name Chords by Artist" at the very top.
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length) {
      const h = lines[0].match(/^\s*(.+?)\s+(?:official\s+)?(?:chords|tabs?|ukulele chords|bass tabs?|guitar chords)\s+by\s+(.+?)\s*$/i);
      if (h) { meta.title = h[1].trim(); meta.artist = h[2].trim(); lines.shift(); }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();
      if (!t) { out.push(''); continue; }

      let m = t.match(/^capo\s*[:\-]?\s*(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+fret)?\b/i);
      if (m) { meta.capo = m[1]; continue; }
      if (/^no capo$/i.test(t)) continue;
      m = t.match(/^key\s*:\s*([A-G][#b♯♭]?m?)\s*$/i);
      if (m) { meta.key = normalizeAccidentals(m[1]); continue; }
      if (/^(tuning|strumming|tempo|bpm)\s*:/i.test(t)) { out.push('{c: ' + t + '}'); continue; }

      if (isTabLine(line)) {
        out.push('{sot}');
        while (i < lines.length && (isTabLine(lines[i]) || (lines[i].trim() && i + 1 < lines.length && isTabLine(lines[i + 1]) && !isChordLine(lines[i])))) {
          out.push(lines[i]);
          i++;
        }
        i--;
        out.push('{eot}');
        continue;
      }

      const label = sectionLabel(t);
      if (label && !isChordLine(t)) { out.push('{c: ' + label + '}'); continue; }

      m = t.match(SECTION_WITH_CHORDS_RE);
      if (m && isChordLine(m[2])) {
        const lbl = m[1].trim();
        out.push('{c: ' + lbl.charAt(0).toUpperCase() + lbl.slice(1) + '}');
        out.push(mergeChordsIntoLyric(m[2], ''));
        merged++;
        continue;
      }

      if (isChordLine(line)) {
        const next = lines[i + 1];
        if (next !== undefined && next.trim() && !isChordLine(next) && !isTabLine(next) && !sectionLabel(next.trim())) {
          out.push(mergeChordsIntoLyric(line, next));
          i++;
        } else {
          out.push(mergeChordsIntoLyric(line, ''));
        }
        merged++;
        continue;
      }

      // Plain lyric/text line. Square brackets would read as chords, so swap them.
      out.push(line.replace(/\[/g, '(').replace(/\]/g, ')'));
    }

    // Collapse runs of blank lines.
    const body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { body, meta, stats: { chordLines: merged } };
  }

  // Entry point for anything pasted or imported.
  function importText(text, filename) {
    const cleaned = cleanPasted(text);
    let body, meta, converted = false, chordLines = 0;
    if (looksLikeChordPro(cleaned) || /\.(cho|chopro|chordpro|crd|pro)$/i.test(filename || '')) {
      body = cleaned.trim();
      meta = parse(body).meta;
    } else {
      const r = convert(cleaned);
      body = r.body; meta = r.meta; converted = true; chordLines = r.stats.chordLines;
    }
    // Pull title/artist/key/capo directives out of the body into song fields.
    body = body.replace(/^\s*\{\s*(title|t|subtitle|st|artist|key|capo)\s*[:\s][^}]*\}\s*\n?/gim, '').trim();
    if (!meta.title && filename) meta.title = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return { body, meta, converted, chordLines };
  }

  const api = {
    parse, convert, importText, chordsIn, isChord, isChordLine, isTabLine, looksLikeChordPro,
    transposeChord, transposeKey, makeTransposer, parseKey, keyName, guessKey, capoOptions, easeScore,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChordPro = api;
})(typeof window !== 'undefined' ? window : globalThis);
