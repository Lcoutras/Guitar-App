// Bundles the app into one self-contained HTML file for a quick online preview.
// Usage: node scripts/build-preview.mjs [outFile]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist/preview.html'));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?/g, '')
  .replace(/<link rel="stylesheet" href="([^"]+)">/, (_, href) => '<style>\n' + read(href) + '</style>')
  .replace(/<meta charset[^>]*>\n?|<meta name="viewport"[^>]*>\n?/g, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script src="([^"]+)"><\/script>/g, (_, src) => '<script>\n' + read(src) + '</script>')
  .replace('<script>', '<script>window.__STAGE_TABS_PREVIEW__ = true;</script>\n<script>');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
console.log('Wrote ' + out);
