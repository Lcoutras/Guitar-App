/*
 * Song search in the MusicBrainz catalogue (musicbrainz.org), a free, open
 * database of recordings. Only titles, artists, albums and years come back;
 * no lyrics or chords. No DOM access, so it is testable in Node.
 */
(function (root) {
  'use strict';

  const API = 'https://musicbrainz.org/ws/2/recording';

  // Versions that are rarely what someone wants to play from.
  const LESSER = /\b(live|remix|demo|instrumental|karaoke|edit|mix|cover|tribute|interview|rehearsal|session)\b/i;

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\s+[-–]\s+.*$/, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // "Wonderwall - Remastered 2014" → "Wonderwall"
  function cleanTitle(t) {
    return String(t || '')
      .replace(/\s*[-–]\s*(\d{4}\s*)?(remaster(ed)?|mono|stereo|single version|album version)\b.*$/i, '')
      .replace(/\s*[([](\d{4}\s*)?(remaster(ed)?|mono|stereo|single version|album version)[^)\]]*[)\]]/ig, '')
      .trim();
  }

  function searchUrl(query) {
    return API + '?query=' + encodeURIComponent(String(query || '').trim()) + '&dismax=true&limit=50&fmt=json';
  }

  function artistName(credit) {
    return (credit || []).map((a) => (a.name || (a.artist && a.artist.name) || '') + (a.joinphrase || '')).join('').trim();
  }

  function isPlainAlbumOrSingle(release) {
    const rg = (release && release['release-group']) || {};
    return (rg['primary-type'] === 'Album' || rg['primary-type'] === 'Single') && !(rg['secondary-types'] || []).length;
  }

  // Turns a MusicBrainz response into a short list of distinct songs.
  function parse(data, limit) {
    const max = limit || 12;
    const byKey = new Map();
    for (const r of (data && data.recordings) || []) {
      const rawTitle = String(r.title || '').trim();
      const artist = artistName(r['artist-credit']);
      if (!rawTitle || !artist) continue;
      const releases = r.releases || [];
      const main = releases.find(isPlainAlbumOrSingle) || releases[0];
      const year = String(r['first-release-date'] || '').slice(0, 4);
      let score = Number(r.score) || 0;
      if (LESSER.test(rawTitle) || LESSER.test(r.disambiguation || '')) score -= 25;
      if (releases.some(isPlainAlbumOrSingle)) score += 3;
      const key = norm(rawTitle) + '|' + norm(artist);
      const item = { title: cleanTitle(rawTitle), artist, album: main ? String(main.title || '') : '', year, score, key };
      const prev = byKey.get(key);
      if (!prev) { byKey.set(key, item); continue; }
      // Same song again (another release): keep the best details.
      prev.score = Math.max(prev.score, score);
      if (year && (!prev.year || year < prev.year)) { prev.year = year; if (item.album) prev.album = item.album; }
      if (item.title.length < prev.title.length) prev.title = item.title;
      if (!prev.album && item.album) prev.album = item.album;
    }
    return [...byKey.values()]
      .filter((x) => x.score >= 30)
      .sort((a, b) => b.score - a.score || (a.year || '9999').localeCompare(b.year || '9999'))
      .slice(0, max);
  }

  const api = { searchUrl, parse, norm, cleanTitle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Catalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
