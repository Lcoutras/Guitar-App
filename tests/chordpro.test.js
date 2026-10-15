// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const CP = require('../js/chordpro.js');

test('recognises chords and rejects words', () => {
  for (const c of ['C', 'Am', 'F#m7', 'Bb', 'Cmaj7', 'Dsus4', 'G/B', 'C6/9', 'E7#9', 'Asus2', 'Bm7b5', 'Cadd9', 'D/F#', '(G)', 'Ebdim', 'Gaug'])
    assert.ok(CP.isChord(c), c);
  for (const w of ['And', 'Go', 'Do', 'Each', 'Am I', 'Be', 'Chorus', 'Dad'])
    assert.ok(!CP.isChord(w), w);
});

test('detects chord lines vs lyric lines', () => {
  assert.ok(CP.isChordLine('  Am      C        D         F'));
  assert.ok(CP.isChordLine('G  |  C  |  D  x2'));
  assert.ok(!CP.isChordLine('Am I the only one'));
  assert.ok(!CP.isChordLine('A house in New Orleans'));
});

test('merges chords over lyrics at the right columns', () => {
  const r = CP.convert('G'.padEnd(15) + 'C'.padEnd(14) + 'G' + '\nAmazing grace, how sweet the sound');
  assert.equal(r.body, '[G]Amazing grace, [C]how sweet the [G]sound');
});

test('chord past the end of the lyric is kept', () => {
  const r = CP.convert('C        G      D\nHello there');
  assert.equal(r.body, '[C]Hello the[G]re     [D]');
});

test('converts a typical copied sheet', () => {
  const text = [
    'Shenandoah Chords by Traditional',
    'Capo 2nd fret',
    '',
    '[Verse 1]',
    'D'.padEnd(15) + 'G'.padEnd(10) + 'D',
    'Oh Shenandoah, I long to see you',
    '',
    'Intro: D G D',
    'e|-----0-----|',
    'B|---3---3---|',
    'G|-2-------2-|',
    'D|-----------|',
    'A|-----------|',
    'E|-----------|',
  ].join('\n');
  const r = CP.convert(text);
  assert.equal(r.meta.title, 'Shenandoah');
  assert.equal(r.meta.artist, 'Traditional');
  assert.equal(r.meta.capo, '2');
  assert.match(r.body, /\{c: Verse 1\}/);
  assert.match(r.body, /\[D\]Oh Shenandoah, \[G\]I long to \[D\]see you/);
  assert.match(r.body, /\{c: Intro\}\n\[D\]  \[G\]  \[D\]/);
  assert.match(r.body, /\{sot\}\ne\|-----0-----\|[\s\S]*E\|-----------\|\n\{eot\}/);
});

test('strips Ultimate Guitar style [ch] markup', () => {
  const r = CP.importText('[ch]Am[/ch]   [ch]C[/ch]\nThere is a house');
  assert.equal(r.body, '[Am]There[C] is a house');
  assert.ok(r.converted);
});

test('ChordPro input is kept as is and directives become fields', () => {
  const r = CP.importText('{title: Test}\n{artist: Me}\n{key: G}\n[G]Hello [C]world');
  assert.equal(r.converted, false);
  assert.equal(r.meta.title, 'Test');
  assert.equal(r.meta.artist, 'Me');
  assert.equal(r.meta.key, 'G');
  assert.equal(r.body, '[G]Hello [C]world');
});

test('parses ChordPro into segments, sections and tabs', () => {
  const p = CP.parse('{soc}\n[G]Sing [C]loud\n{eoc}\n{sot}\ne|--0--|\n{eot}\nNo chords here');
  assert.deepEqual(p.items.map((i) => i.type), ['start', 'line', 'end', 'tab', 'line']);
  assert.deepEqual(p.items[1].segs, [{ c: 'G', t: 'Sing ' }, { c: 'C', t: 'loud' }]);
  assert.equal(p.items[4].hasChords, false);
});

test('transposes chords with sensible spelling', () => {
  assert.equal(CP.transposeChord('G', 2, false), 'A');
  assert.equal(CP.transposeChord('D/F#', 2, false), 'E/G#');
  assert.equal(CP.transposeChord('Am7', 1, true), 'Bbm7');
  assert.equal(CP.transposeChord('(C)', -1, false), '(B)');
  assert.equal(CP.transposeChord('N.C.', 3, false), 'N.C.');
  const tr = CP.makeTransposer('C', 1, ['C', 'F', 'G']);
  assert.deepEqual(['C', 'F', 'G'].map(tr), ['Db', 'Gb', 'Ab']);
  const tr2 = CP.makeTransposer('G', 2, ['G', 'C', 'D']);
  assert.deepEqual(['G', 'C', 'D', 'Em'].map(tr2), ['A', 'D', 'E', 'F#m']);
  assert.equal(CP.transposeKey('Am', 3), 'Cm');
  assert.equal(CP.transposeKey('F', -1), 'E');
});

test('capo helper finds easy shapes', () => {
  // Song in Bb: capo 3 lets you play G shapes.
  const opts = CP.capoOptions(['Bb', 'Eb', 'F', 'Gm'], 'Bb', 0);
  const best = opts.slice().sort((a, b) => b.score - a.score || a.capo - b.capo)[0];
  assert.equal(best.capo, 3);
  assert.equal(best.shapesKey, 'G');
});
