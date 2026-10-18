// Browser check at iPad and phone sizes. Usage: node tests/e2e.mjs [outDir]
// Serves the app locally, walks through the main flows, saves screenshots and
// fails on console errors or sideways page scrolling.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'test-results'));
fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await playwright.chromium.launch();

// Stand-in for the MusicBrainz song catalogue.
const MB = {
  wonderwall: [
    { title: 'Wonderwall - Remastered', score: 100, 'first-release-date': '2014-09-29', 'artist-credit': [{ name: 'Oasis' }], releases: [{ title: 'Morning Glory (Deluxe)', 'release-group': { 'primary-type': 'Album', 'secondary-types': [] } }] },
    { title: 'Wonderwall', score: 98, 'first-release-date': '1995-10-02', 'artist-credit': [{ name: 'Oasis' }], releases: [{ title: '(What’s the Story) Morning Glory?', 'release-group': { 'primary-type': 'Album', 'secondary-types': [] } }] },
    { title: 'Wonderwall', score: 90, 'first-release-date': '2005-01-01', 'artist-credit': [{ name: 'Ryan Adams' }], releases: [{ title: 'Love Is Hell', 'release-group': { 'primary-type': 'Album', 'secondary-types': [] } }] },
  ],
  'amazing grace': [
    { title: 'Amazing Grace', score: 100, 'first-release-date': '1972', 'artist-credit': [{ name: 'John Newton' }], releases: [] },
  ],
};
async function fakeCatalog(ctx) {
  await ctx.route('https://musicbrainz.org/**', (r) => {
    const q = new URL(r.request().url()).searchParams.get('query').toLowerCase();
    const key = Object.keys(MB).find((k) => q.includes(k));
    r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ recordings: key ? MB[key] : [] }) });
  });  await ctx.route('https://www.ultimate-guitar.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Chords</title>' }));
}
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

async function newPage(name, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: !!opts.mobile, serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await fakeCatalog(ctx);
  // Never send test suggestions to the real ticket database.
  if (!opts.tickets) await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.STAGE_TABS_CONFIG = {};' }));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`${name}: console error: ${m.text()}`); });
  page.on('pageerror', (e) => failures.push(`${name}: page error: ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('.song-row');
  return { ctx, page };
}

async function noSideScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `${label}: page scrolls sideways by ${over}px`);
}

const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });

const sizes = [
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 } },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, mobile: true },
];

for (const size of sizes) {
  const { ctx, page } = await newPage(size.name, size.viewport, size);
  const wide = size.viewport.width >= 900;

  // Library
  const titles = await page.$$eval('.song-row .row-title', (els) => els.map((e) => e.textContent));
  check(titles.length === 4, `${size.name}: expected 4 example songs, got ${titles.length}`);
  check(titles[0] === 'Amazing Grace' && titles[1] === 'House of the Rising Sun', `${size.name}: A–Z order wrong: ${titles.join(', ')}`);
  await noSideScroll(page, size.name + ' library');
  await shot(page, `${size.name}-1-library`);

  // Sort by artist and search
  await page.click('[data-act="sort"][data-sort="artist"]');
  const heads = await page.$$eval('.group-head', (els) => els.map((e) => e.textContent));
  check(heads[0] === 'John Newton (trad.)', `${size.name}: artist sort first group is ${heads[0]}`);
  await page.fill('#q', 'susan');
  check((await page.$$('.song-row')).length === 1, `${size.name}: search should find 1 song`);
  // Song search: find a song that isn't in the library and add it
  await page.fill('#q', 'wonderwall');
  await page.waitForSelector('.catalog-row');
  const found = await page.$$eval('.catalog-row', (els) => els.map((e) => e.querySelector('.row-title').textContent + ' / ' + e.querySelector('.row-sub').textContent));
  check(found.length === 2 && found[0].startsWith('Wonderwall / Oasis') && found[0].includes('1995'), `${size.name}: catalogue results wrong: ${found.join(' | ')}`);
  check(!!(await page.$('.catalog-foot a[href*="ultimate-guitar.com/search.php"]')), `${size.name}: search should still offer Find online`);
  await shot(page, `${size.name}-1b-song-search`);
  const [chordsTab] = await Promise.all([page.context().waitForEvent('page'), page.click('.catalog-row')]);
  check(chordsTab.url().includes('ultimate-guitar.com/search.php') && chordsTab.url().includes('Wonderwall'), `${size.name}: chords tab not opened: ${chordsTab.url()}`);
  await chordsTab.close();
  await page.waitForSelector('#find-online.highlight');
  check((await page.$eval('#ed-title', (e) => e.value)) === 'Wonderwall' && (await page.$eval('#ed-artist', (e) => e.value)) === 'Oasis', `${size.name}: editor not filled from search`);
  await shot(page, `${size.name}-1c-added-from-search`);
  await page.click('[data-act="cancel-edit"]');
  await page.fill('#q', 'wonderwall');
  await page.waitForSelector('.song-row:not(.catalog-row) .row-title');
  check((await page.$eval('.song-row:not(.catalog-row)', (e) => e.textContent)).includes('No chords yet'), `${size.name}: added song not in library`);
  await page.waitForSelector('.catalog-row');
  check((await page.$eval('.catalog-row', (e) => e.textContent)).includes('In your songs'), `${size.name}: search should show the song is already added`);
  // Remove it again so the rest of the walkthrough sees the usual library
  await page.evaluate(async () => {
    const st = window.StageTabs.state;
    const s = st.songs.find((x) => x.title === 'Wonderwall');
    st.songs = st.songs.filter((x) => x !== s);
    await window.Store.remove('songs', s.id);
  });
  await page.fill('#q', 'amazing grace');
  await page.waitForSelector('.catalog-row');
  check((await page.$eval('.catalog-row', (e) => e.textContent)).includes('In your songs'), `${size.name}: example song should count as already added`);
  await page.fill('#q', '');
  await page.click('[data-act="sort"][data-sort="title"]');

  // Open a song in performance view
  if (wide) {
    await page.click('.song-row:has-text("Rising Sun")');
    await page.click('#preview [data-act="perform"]');
  } else {
    await page.click('.song-row:has-text("Rising Sun")');
  }
  await page.waitForSelector('#sheet-scroll .sheet');
  check((await page.$$eval('#sheet-scroll .ch.on', (els) => els.length)) > 20, `${size.name}: chords not rendered`);
  await noSideScroll(page, size.name + ' perform');
  await shot(page, `${size.name}-2-perform`);

  // Chords sit above the right words
  const pos = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('#sheet-scroll .c')].find((c) => c.querySelector('.ly').textContent.startsWith('house'));
    const ch = cell.querySelector('.ch').getBoundingClientRect();
    const ly = cell.querySelector('.ly').getBoundingClientRect();
    return { chord: cell.querySelector('.ch').textContent, above: ch.bottom <= ly.top + 1, left: Math.abs(ch.left - ly.left) };
  });
  check(pos.chord === 'C' && pos.above && pos.left < 1, `${size.name}: chord C not above "house": ${JSON.stringify(pos)}`);

  // Transpose up 2: Am -> Bm
  await page.click('[data-act="transpose"][data-d="1"]');
  await page.click('[data-act="transpose"][data-d="1"]');
  const first = await page.$eval('#sheet-scroll .ch.on', (e) => e.textContent);
  check(first === 'Bm', `${size.name}: transpose gave ${first}`);
  await page.click('[data-act="transpose"][data-d="-1"]');
  await page.click('[data-act="transpose"][data-d="-1"]');

  // Autoscroll moves the sheet; pedal keys page down
  await page.click('[data-act="speed"][data-d="1"]');
  await page.click('#play-btn');
  await page.waitForTimeout(1200);
  const scrolled = await page.$eval('#sheet-scroll', (e) => e.scrollTop);
  check(scrolled > 10, `${size.name}: autoscroll did not move (${scrolled})`);
  await page.keyboard.press('Space');
  const before = await page.$eval('#sheet-scroll', (e) => e.scrollTop);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(700);
  const after = await page.$eval('#sheet-scroll', (e) => e.scrollTop);
  check(after > before + 50, `${size.name}: PageDown did not scroll (${before} -> ${after})`);

  // Capo helper
  await page.click('[data-act="capo"]');
  await page.waitForSelector('.capo-row');
  await shot(page, `${size.name}-3-capo`);
  await page.click('#m-cancel');
  await page.click('[data-act="exit-perform"]');

  // Add a song by pasting a chord sheet
  await page.click('[data-act="new-song"]');
  await page.waitForSelector('#ed-body');
  const sheet = await page.evaluate(() => window.Seed.pasteExample);
  await page.focus('#ed-body');
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.getElementById('ed-body').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, sheet);
  await page.waitForTimeout(200);
  const body = await page.$eval('#ed-body', (e) => e.value);
  check(body.includes('[D]Oh Shenandoah, I [G]long to [D]see you'), `${size.name}: paste conversion wrong:\n${body.slice(0, 200)}`);
  check((await page.$eval('#ed-title', (e) => e.value)) === 'Shenandoah', `${size.name}: title not filled from paste`);
  // Send a badly pasted song: message includes the song and the original paste
  await page.click('[data-act="feedback-song"]');
  await page.waitForSelector('#fb-msg');
  check((await page.getAttribute('[data-kind="song"]', 'aria-pressed')) === 'true', `${size.name}: song feedback not preselected`);
  await page.fill('#fb-msg', 'Chorus chords look shifted');
  await shot(page, `${size.name}-4b-suggest-song`);
  await page.click('#fb-copy');
  const sent = await page.evaluate(() => navigator.clipboard.readText());
  check(sent.includes('Song looks wrong') && sent.includes('Chorus chords look shifted'), `${size.name}: feedback text missing message`);
  check(sent.includes('[D]Oh Shenandoah, I [G]long to') && sent.includes('As originally pasted') && sent.includes('Shenandoah Chords by Traditional'),
    `${size.name}: feedback missing the song or original paste`);
  if (!wide) { await page.click('[data-act="ed-pane"][data-pane="preview"]'); await page.waitForTimeout(150); }
  await noSideScroll(page, size.name + ' editor');
  await shot(page, `${size.name}-4-editor`);
  await page.click('[data-act="save-edit"]');
  await page.waitForTimeout(200);
  check((await page.$$('.song-row')).length === 5, `${size.name}: new song not in library`);

  // Setlist: open, play through, next song
  await page.click('[data-act="tab"][data-tab="setlists"]');
  await shot(page, `${size.name}-5-setlists`);
  await page.click('.set-card');
  await page.waitForSelector('.set-row');
  await shot(page, `${size.name}-6-setlist`);
  await page.click('[data-act="play-set"]');
  await page.waitForSelector('.set-pos');
  check((await page.$eval('.ptitle .t', (e) => e.textContent)) === 'Oh! Susanna', `${size.name}: setlist did not start at song 1`);
  await page.click('.pfoot [data-act="next-song"]');
  check((await page.$eval('.ptitle .t', (e) => e.textContent)) === 'House of the Rising Sun', `${size.name}: next song failed`);
  check((await page.$eval('.set-pos', (e) => e.textContent)).startsWith('2 / 4'), `${size.name}: setlist position wrong`);
  // Pedal at the end of a song moves to the next one
  await page.$eval('#sheet-scroll', (e) => { e.scrollTop = e.scrollHeight; });
  await page.keyboard.press('ArrowRight');
  check((await page.$eval('.ptitle .t', (e) => e.textContent)) === 'Lantern on the Ridge', `${size.name}: pedal at end did not advance`);
  const tabFit = await page.$eval('#sheet-scroll pre.tab', (p) => p.scrollWidth - p.clientWidth);
  check(tabFit <= 1, `${size.name}: guitar tab is ${tabFit}px wider than the screen`);
  await page.click('[data-act="font"][data-d="1"]');
  await page.click('[data-act="font"][data-d="1"]');
  const tabFitBig = await page.$eval('#sheet-scroll pre.tab', (p) => p.scrollWidth - p.clientWidth);
  check(tabFitBig <= 1, `${size.name}: guitar tab overflows after enlarging text by ${tabFitBig}px`);
  await page.$eval('#sheet-scroll', (e) => { e.scrollTop = 0; });
  await shot(page, `${size.name}-7-perform-setlist`);

  // Settings and daylight mode
  await page.click('[data-act="exit-perform"]');
  await page.click('[data-act="home"]');
  await page.click('[data-act="settings"]');
  await noSideScroll(page, size.name + ' settings');
  await shot(page, `${size.name}-8-settings`);
  // General suggestion with a saved address
  await page.fill('#feedback-to', 'friend@example.com');
  await page.press('#feedback-to', 'Tab');
  await page.click('[data-act="feedback"]');
  await page.waitForSelector('#fb-msg');
  check((await page.textContent('#fb-send')).includes('Email it'), `${size.name}: email button label wrong`);
  check(!(await page.$('[data-kind="song"]')), `${size.name}: song option shown without a song`);
  await page.click('[data-kind="problem"]');
  await page.fill('#fb-msg', 'Add a metronome');
  await page.click('#fb-copy');
  const idea = await page.evaluate(() => navigator.clipboard.readText());
  check(idea.startsWith('Stage Tabs: Something’s not working') && idea.includes('Add a metronome') && !idea.includes('=== Song'), `${size.name}: general feedback text wrong:\n${idea}`);
  const links = await page.evaluate(() => [
    window.StageTabs.feedbackLink('friend@example.com', 'Hi', 'Body'),
    window.StageTabs.feedbackLink('+1 555 123 4567', 'Hi', 'Body'),
  ]);
  check(links[0] === 'mailto:friend@example.com?subject=Hi&body=Body', `${size.name}: mailto link wrong: ${links[0]}`);
  check(links[1].startsWith('sms:+15551234567&body='), `${size.name}: sms link wrong: ${links[1]}`);
  await page.click('[data-act="stage"][data-stage="light"]');
  await page.click('[data-act="home"]');
  await page.click('[data-act="tab"][data-tab="songs"]');
  if (!wide) await page.click('.song-row:has-text("Lantern")');
  await shot(page, `${size.name}-9-daylight`);

  // Data survives a reload (IndexedDB)
  await page.reload();
  await page.waitForSelector('.song-row');
  check((await page.$$('.song-row')).length === 5, `${size.name}: songs lost after reload`);
  check((await page.getAttribute('html', 'data-stage')) === 'light', `${size.name}: setting lost after reload`);
  await ctx.close();
}

// Installed app (Home Screen / desktop): refresh button and update message
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await fakeCatalog(ctx);
  await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.STAGE_TABS_CONFIG = {};' }));
  await ctx.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`installed: page error: ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('.song-row');
  check(!!(await page.$('.topbar [data-act="refresh"]')), 'installed: no refresh button in the header');
  await page.evaluate(() => window.StageTabs.showUpdateReady());
  await page.waitForSelector('#update-bar');
  await page.screenshot({ path: path.join(out, 'installed-update-ready.png') });
  await Promise.all([page.waitForEvent('load'), page.click('#update-bar [data-update="go"]')]);
  await page.waitForSelector('.song-row');
  await Promise.all([page.waitForEvent('load'), page.click('.topbar [data-act="refresh"]')]);
  await page.waitForSelector('.song-row');
  // An update during a song waits until the song is closed
  await page.click('.song-row');
  await page.click('#preview [data-act="perform"]');
  await page.evaluate(() => window.StageTabs.showUpdateReady());
  check(!(await page.$('#update-bar')), 'installed: update message interrupted a song');
  await page.click('[data-act="exit-perform"]');
  await page.waitForSelector('#update-bar', { timeout: 2000 }).catch(() => failures.push('installed: update message not shown after the song'));
  await ctx.close();
}
{
  const { ctx, page } = await newPage('browser-tab', { width: 1180, height: 820 });
  check(!(await page.$('.topbar [data-act="refresh"]')), 'browser tab: refresh button should only show in the installed app');
  await page.click('[data-act="settings"]');
  check((await page.textContent('.settings-sec:has([data-act="refresh"])')).includes('version 1.5'), 'settings: version not shown');
  await Promise.all([page.waitForEvent('load'), page.click('.settings-sec [data-act="refresh"]')]);
  await ctx.close();
}

// Paste button, copy steps, and tidying songs that were saved untidy
{
  const { ctx, page } = await newPage('paste', { width: 820, height: 1180 }, { mobile: true });
  const src = fs.readFileSync(path.join(root, 'tests/chordpro.test.js'), 'utf8');
  const pageCopy = eval(src.match(/const PAGE_COPY = (\[[\s\S]*?\]\.join\('\\n'\));/)[1]);
  await page.click('[data-act="new-song"]');
  check(!!(await page.$('.copy-steps')), 'paste: copy steps not shown for a new song');
  await shot(page, 'paste-1-steps');
  await page.evaluate((t) => navigator.clipboard.writeText(t), pageCopy);
  await page.click('[data-act="paste-clip"]');
  await page.waitForFunction(() => document.getElementById('ed-body').value.includes('{c: Verse 1}'));
  const body = await page.$eval('#ed-body', (e) => e.value);
  check(!/Autoscroll|views|022000|Report bad tab|Log in/.test(body), 'paste: page extras left in:\n' + body);
  check((await page.$eval('#ed-title', (e) => e.value)) === 'Highway Lights' && (await page.$eval('#ed-artist', (e) => e.value)) === 'The Night Drivers', 'paste: title/artist not filled');
  check(!(await page.$('.copy-steps')), 'paste: copy steps should hide once a song is in');
  // Pasting more into a song that is already there adds a tidied-up part at the cursor
  await page.$eval('#ed-body', (e) => { e.focus(); e.selectionStart = e.selectionEnd = e.value.length; });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '\n[Bridge]\nAm        G\nSlow it down now');
    document.getElementById('ed-body').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const body2 = await page.$eval('#ed-body', (e) => e.value);
  check(body2.trim().endsWith('{c: Bridge}\n[Am]Slow it do[G]wn now'), 'paste: second paste not tidied:\n' + body2.slice(-80));
  await page.click('[data-act="save-edit"]');
  await page.waitForSelector('.song-row');
  // A song saved earlier with chords as plain lines is fixed on next launch
  await page.evaluate(() => window.Store.put('songs', {
    id: 'raw-1', title: 'Untidy Song', artist: 'Someone', key: '', capo: 0, tempo: '', transpose: 0, fontScale: 1, scrollLevel: 6,
    body: '[Verse]\nG       C\nHello again\nD       G\nGoodbye now', createdAt: 1, updatedAt: 1,
  }));
  await page.reload();
  await page.waitForSelector('.song-row');
  const fixed = await page.evaluate(() => window.StageTabs.state.songs.find((x) => x.id === 'raw-1').body);
  check(fixed === '{c: Verse}\n[G]Hello ag[C]ain\n[D]Goodbye [G]now', 'paste: untidy saved song not fixed:\n' + fixed);
  await page.click('.song-row:has-text("Untidy Song")');
  await page.waitForSelector('#sheet-scroll .ch.on');
  await shot(page, 'paste-2-untidy-fixed');
  await ctx.close();
}

// Suggestion tickets, with a fake ticket server
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`tickets: page error: ${e.message}`));
  await page.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.STAGE_TABS_CONFIG = { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test' };" }));
  const received = [];
  let online = true;
  let next = 41;
  await page.route('https://example.supabase.co/**', async (r) => {
    if (!online) return r.abort('internetdisconnected');
    received.push({ url: r.request().url(), headers: r.request().headers(), body: JSON.parse(r.request().postData()) });
    await r.fulfill({ contentType: 'application/json', body: String(++next), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(base);
  await page.waitForSelector('.song-row');
  await page.click('[data-act="settings"]');
  await page.fill('#feedback-name', 'Sam');
  await page.press('#feedback-name', 'Tab');
  await page.click('[data-act="feedback"]');
  check((await page.textContent('#fb-send')).includes('Send'), 'tickets: Send button missing');
  await page.fill('#fb-msg', 'Add a metronome');
  await page.click('#fb-send');
  await page.waitForSelector('#toast:not([hidden])');
  check((await page.textContent('#toast')).includes('Ticket #42'), 'tickets: no ticket number shown: ' + (await page.textContent('#toast')));
  const r0 = received[0];
  check(r0 && r0.url.endsWith('/rest/v1/rpc/submit_feedback'), 'tickets: wrong endpoint');
  check(r0 && r0.headers.apikey === 'sb_publishable_test' && !r0.headers.authorization, 'tickets: wrong key headers');
  check(r0 && r0.body.p_kind === 'idea' && r0.body.p_message === 'Add a metronome' && r0.body.p_from_name === 'Sam' && r0.body.p_song_title === '', 'tickets: wrong payload ' + JSON.stringify(r0 && r0.body));
  await page.waitForSelector('.tickets li');
  check((await page.textContent('.tickets')).includes('#42'), 'tickets: sent ticket not listed in Settings');

  // Offline: a song report is saved, then sent when the connection returns
  online = false;
  await page.click('[data-act="home"]');
  await page.click('[data-act="new-song"]');
  await page.click('[data-act="paste-example"]');
  await page.click('[data-act="feedback-song"]');
  await page.fill('#fb-msg', 'Verse 2 chords are off');
  await page.click('#fb-send');
  await page.waitForTimeout(300);
  check((await page.textContent('#toast')).includes('back online'), 'tickets: offline message missing');
  check(received.length === 1, 'tickets: offline ticket should not have arrived');
  online = true;
  await page.evaluate(() => window.StageTabs.flushTickets());
  await page.waitForTimeout(300);
  const r1 = received[1];
  check(r1 && r1.body.p_kind === 'song' && r1.body.p_song_title === 'Shenandoah' && r1.body.p_song_source.includes('Shenandoah Chords by Traditional') && r1.body.p_song_body.includes('[D]Oh Shenandoah'),
    'tickets: queued song report wrong ' + JSON.stringify(r1 && r1.body).slice(0, 200));
  await page.click('[data-act="cancel-edit"]');
  await page.click('[data-act="settings"]');
  await page.waitForSelector('.tickets li');
  check((await page.textContent('.tickets')).includes('#43') && !(await page.textContent('.tickets')).includes('Waiting'), 'tickets: queue not cleared in Settings');
  await page.screenshot({ path: path.join(out, 'tickets-settings.png') });
  await ctx.close();
}

// App icons
{
  const ctx = await browser.newContext({ viewport: { width: 512, height: 512 } });
  const page = await ctx.newPage();
  const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
  for (const [file, size, pad] of [['icon-512.png', 512, 0], ['icon-192.png', 192, 0], ['apple-touch-icon.png', 180, 0]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:#0d1016}svg{display:block;width:${size}px;height:${size}px}</style>${svg.replace('rx="112"', pad ? 'rx="0"' : 'rx="0"')}`);
    await page.screenshot({ path: path.join(root, 'icons', file) });
  }
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) { console.error('FAILED:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('All browser checks passed. Screenshots in ' + out);
