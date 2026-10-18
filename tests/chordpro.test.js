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

test('copies with an empty line after every line still line up', () => {
  const text = [
    '[Verse 1]', '',
    'G'.padEnd(15) + 'C', '',
    'Amazing grace, how sweet the sound', '',
    'G'.padEnd(20) + 'D', '',
    'That saved a wretch like me', '', '', '',
    '[Chorus]', '',
    'C'.padEnd(5) + 'G', '',
    'Sing it out loud', '',
  ].join('\n');
  const r = CP.convert(text);
  assert.equal(r.body, [
    '{c: Verse 1}',
    '[G]Amazing grace, [C]how sweet the sound',
    '[G]That saved a wretch [D]like me',
    '',
    '{c: Chorus}',
    '[C]Sing [G]it out loud',
  ].join('\n'));
});

test('notes and repeat counts on chord lines are kept', () => {
  assert.ok(CP.isChordLine('Am   G   (let ring)'));
  assert.equal(CP.convert('G   C   D   x2').body, '[G]    [C]    [D]  (x2)');
  assert.equal(CP.convert('Am      G (let ring)\nHello there friend').body, '[Am]Hello th[G]ere friend  (let ring)');
  assert.ok(!CP.isChordLine('(Repeat chorus)'));
});

test('Windows line endings, tabs and non-breaking spaces', () => {
  const r = CP.convert('G\u00a0\u00a0\u00a0C\r\nHey there Joe\r\n');
  assert.equal(r.body, '[G]Hey [C]there Joe');
});

// A whole chord page copied from a phone or iPad, with the site's extras.
// The song itself is made up.
const PAGE_COPY = [
  'Log in', 'Sign up', 'Tabs', 'Courses',
  'Highway Lights Chords by The Night Drivers',
  'Difficulty: novice',
  'Tuning: E A D G B E',
  'Key: Em',
  'Capo: no capo',
  'Autoscroll', 'Transpose', 'Simplify',
  '[Intro]',
  'Em   D   G   Em',
  '',
  '[Verse 1]',
  'Em'.padEnd(11) + 'D'.padEnd(8) + 'G',
  'Out on the highway lights are low',
  'Em'.padEnd(8) + 'D'.padEnd(8) + 'G',
  'Nowhere left to go',
  '',
  '[Chorus]',
  'C'.padEnd(8) + 'G',
  'Keep on driving',
  '',
  'Chords',
  'Em 022000', 'D xx0232', 'G 320003', 'C x32010',
  'Last update: Mar 3, 2021',
  '1,234 views',
  'Rating',
  '4.8',
  'Report bad tab',
].join('\n');

test('a whole copied page is reduced to just the song', () => {
  const r = CP.importText(PAGE_COPY);
  assert.equal(r.meta.title, 'Highway Lights');
  assert.equal(r.meta.artist, 'The Night Drivers');
  assert.equal(r.meta.key, 'Em');
  assert.equal(r.body, [
    '{c: Tuning: E A D G B E}',
    '{c: Intro}',
    '[Em]     [D]    [G]    [Em]',
    '',
    '{c: Verse 1}',
    '[Em]Out on the [D]highway [G]lights are low',
    '[Em]Nowhere [D]left to [G]go',
    '',
    '{c: Chorus}',
    '[C]Keep on [G]driving',
  ].join('\n'));
});

test('ordinary lyric lines are never treated as page extras', () => {
  for (const t of ['Key to my heart', 'Show me the way', 'Stop', 'Hold on', 'Well I won’t give in', 'Em']) assert.ok(!CP.isPageJunk(t), t);
  for (const t of ['Difficulty: novice', 'Em 022000', 'x32010', '1,234 views', 'Autoscroll', 'Capo: no capo', 'Last update: Jan 5, 2020']) assert.ok(CP.isPageJunk(t), t);
});
