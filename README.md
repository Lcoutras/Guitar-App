# Stage Tabs

Chord sheets and tabs for playing live from an iPad. Stage Tabs is a web app that installs to the home screen, works with no internet, and keeps everything on the device. It needs no server or account.

## What it does

- **Library**: songs sorted A–Z by title or by artist, with instant search and an A–Z jump bar. "The", "A" and "An" are ignored when sorting.
- **Getting songs in**: paste a chord sheet copied from any website. Chords written on the line above the lyrics are lined up over the right words automatically, guitar tab blocks are kept as they are, and section names (Verse, Chorus, Intro…) are recognised. ChordPro and plain-text files can be imported too.
- **Find online**: buttons open a search on Ultimate Guitar or Songsterr in Safari. Copy the chords from there and paste them in. The app doesn't download from those sites itself, because their terms forbid automated copying and the lyrics are copyrighted.
- **Stage view**: large chords above the lyrics on a dark, high-contrast screen. There is also a Daylight option for outdoor gigs.
  - Autoscroll: tap the sheet or press play to start and pause. Each song remembers its own speed.
  - Text size, transpose up or down, and a capo helper that suggests the capo position with the easiest chord shapes. All are remembered per song.
  - Keeps the screen awake while a song is open.
  - Bluetooth page-turner pedals: → ↓ PageDown go forward a screen (and on to the next song at the end), ← ↑ PageUp go back, Space/Enter start or pause autoscroll.
- **Setlists**: ordered lists for each gig. Swipe sideways or use the pedal to move between songs during the show.
- **Backup**: save a backup file to Files or iCloud Drive, and restore it on any device.
- **Suggestions**: send an idea or a problem from Settings, or tap "Song looks wrong? Send it" in the song editor. A song is sent along with the text that was originally pasted, so the conversion can be fixed. Each suggestion becomes a numbered ticket in a Supabase database (see *Suggestion tickets* below). Suggestions sent offline wait on the device and go out automatically later. If no database is set up, suggestions go by email or text message instead.

## Install on the iPad

1. Open the app's web address in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open it from the home screen. It now runs full screen and works offline.

Songs are stored in the iPad's browser storage. Installing to the home screen makes it much less likely that iPadOS will clear them, but save a backup now and then (Settings → Save backup file).

## Hosting

The app is a set of static files, so any static host works. GitHub Pages is the simplest: in the repository settings, go to Pages and choose "Deploy from a branch", then pick `main` and `/ (root)`. It must be served over HTTPS for offline mode and installing to work.

When you change any app file, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Suggestion tickets

Suggestions are stored in a free [Supabase](https://supabase.com) project of their own.

1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste the contents of `supabase/feedback.sql`, and tap **Run**.
3. In **Project Settings → API**, copy the **Project URL** and the **publishable** (anon) key into `js/config.js`.

Tickets appear in **Table Editor → feedback**, newest last. Change `status` to `in progress`, `done` or `won't fix` as you work through them. The publishable key is meant to be public: the database only lets it add tickets through `submit_feedback()`, never read, change or delete them.

## Development

There is no build step. The files are plain HTML, CSS and JavaScript.

```
npm start          # serve locally at http://localhost:8080
npm test           # converter unit tests + browser checks at iPad and phone sizes
npm run preview    # bundle everything into dist/preview.html (single file)
```

| File | Purpose |
| --- | --- |
| `js/chordpro.js` | Parses ChordPro, converts pasted chord sheets, transposes, capo suggestions |
| `js/store.js` | On-device storage (IndexedDB) |
| `js/app.js` | Screens: library, setlists, editor, stage view, settings |
| `js/seed.js` | Example songs (public domain, plus one original) |
| `sw.js` | Offline caching |

The browser checks in `tests/e2e.mjs` need Playwright with Chromium.

## Writing chord sheets by hand (ChordPro)

```
{c: Verse 1}
[G]Amazing [G7]grace, how [C]sweet the [G]sound

{soc}
[F]Oh! Susanna, oh [C]don't you cry for [G]me
{eoc}
{chorus}            repeats the last chorus

{sot}
e|-----0-----|
{eot}
```

## Ideas for later

- Import PDFs.
- Listen to a recording and suggest chords (audio chord detection).
- Two-column layout for iPad landscape.
- Sync between devices.

## Example songs

The bundled examples are public domain (*Amazing Grace*, *House of the Rising Sun* in a traditional text, *Oh! Susanna*, *Shenandoah*) plus *Lantern on the Ridge*, an original written for this app. Don't commit copyrighted lyrics to this repository.
