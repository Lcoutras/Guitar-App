// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../js/catalog.js');

const rec = (title, artist, opts = {}) => ({
  title,
  score: opts.score ?? 100,
  'first-release-date': opts.date || '',
  disambiguation: opts.dis || '',
  'artist-credit': Array.isArray(artist) ? artist : [{ name: artist, joinphrase: '' }],
  releases: opts.releases || [{ title: opts.album || 'Album', 'release-group': { 'primary-type': opts.type || 'Album', 'secondary-types': opts.sec || [] } }],
});

test('builds a simple search request', () => {
  assert.equal(Catalog.searchUrl(' wonderwall oasis '), 'https://musicbrainz.org/ws/2/recording?query=wonderwall%20oasis&dismax=true&limit=50&fmt=json');
});

test('merges the many releases of one song and keeps the earliest year', () => {
  const out = Catalog.parse({ recordings: [
    rec('Wonderwall - Remastered 2014', 'Oasis', { date: '2014-09-29', album: '(What’s the Story) Morning Glory? (Deluxe)' }),
    rec('Wonderwall', 'Oasis', { date: '1995-10-02', album: '(What’s the Story) Morning Glory?' }),
    rec('Wonderwall', 'Oasis', { date: '1995-10-30', type: 'Single', album: 'Wonderwall' }),
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Wonderwall');
  assert.equal(out[0].artist, 'Oasis');
  assert.equal(out[0].year, '1995');
  assert.equal(out[0].album, '(What’s the Story) Morning Glory?');
});

test('puts studio versions above live, karaoke and covers', () => {
  const out = Catalog.parse({ recordings: [
    rec('Wonderwall (live at Knebworth)', 'Oasis', { score: 100 }),
    rec('Wonderwall', 'Karaoke Kings', { score: 100, dis: 'karaoke version' }),
    rec('Wonderwall', 'Oasis', { score: 95 }),
  ] });
  assert.equal(out[0].artist, 'Oasis');
  assert.equal(out[0].title, 'Wonderwall');
});

test('joins multiple artists and skips incomplete entries', () => {
  const out = Catalog.parse({ recordings: [
    rec('Under Pressure', [{ name: 'Queen', joinphrase: ' & ' }, { name: 'David Bowie', joinphrase: '' }]),
    { title: '', 'artist-credit': [{ name: 'X' }] },
    { title: 'No artist', 'artist-credit': [] },
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].artist, 'Queen & David Bowie');
});

test('copes with empty or odd responses', () => {
  assert.deepEqual(Catalog.parse(null), []);
  assert.deepEqual(Catalog.parse({}), []);
  assert.deepEqual(Catalog.parse({ recordings: [rec('Low score', 'Someone', { score: 12 })] }), []);
});
