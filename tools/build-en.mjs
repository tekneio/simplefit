#!/usr/bin/env node
// Baut en/index.html aus index.html (deutsch, Quelle für Aufbau und Gestaltung) und tools/en.json (englische Texte).
// Nach jeder Änderung an index.html oder en.json im Repo-Wurzelordner aufrufen: node tools/build-en.mjs
// en/index.html nie von Hand ändern.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const { meta, alts = {}, texts } = JSON.parse(readFileSync('tools/en.json', 'utf8'));
let html = readFileSync('index.html', 'utf8');

function closing(tag, from) {
  const re = new RegExp(`<(/?)${tag}\\b`, 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) { depth += m[1] ? -1 : 1; if (!depth) return m.index; }
  throw new Error(`kein Ende für <${tag}>`);
}
// Wer eine Stelle nicht findet, bricht ab: so fällt auf, wenn sich index.html geändert hat.
function sub(re, value) {
  if (!re.test(html)) throw new Error(`nicht gefunden: ${re}`);
  html = html.replace(re, value);
}
const attr = s => s.replace(/&(?!amp;|#)/g, '&amp;').replace(/"/g, '&quot;');

// 1. Texte: Inhalt jedes Elements mit data-key ersetzen.
const open = /<([a-z0-9]+)\b[^>]*\bdata-key="([^"]+)"[^>]*>/g;
const used = new Set();
let out = '', pos = 0, m;
while ((m = open.exec(html))) {
  const start = m.index + m[0].length;
  const end = closing(m[1], start);
  if (!(m[2] in texts)) throw new Error(`en.json fehlt der Text «${m[2]}»`);
  used.add(m[2]);
  out += html.slice(pos, start) + texts[m[2]];
  pos = end;
  open.lastIndex = end;
}
html = out + html.slice(pos);
for (const key of Object.keys(texts)) if (!used.has(key)) console.warn(`en.json: «${key}» kommt in index.html nicht vor`);

// 2. Bildschirmfotos mit Sprachfassung (data-shot) und ihr Alternativtext.
html = html.replace(/<img\b[^>]*\bdata-shot="[^"]+"[^>]*>/g, img => {
  const en = img.match(/data-alt-en="([^"]*)"/)?.[1];
  img = img.replace(/src="screenshots\/de\//, 'src="screenshots/en/');
  return en === undefined ? img : img.replace(/\balt="[^"]*"/, `alt="${en}"`);
});

// Übrige Bildbeschreibungen und Beschriftungen: en.json «alts», deutscher Wortlaut als Schlüssel.
html = html.replace(/\b(alt|aria-label)="([^"]*)"/g, (all, name, value) => value in alts ? `${name}="${alts[value]}"` : all);

// 3. Kopf: Sprache, Titel, Beschreibungen, Adresse.
const seite = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
sub(/<html lang="de">/, '<html lang="en">');
sub(/<title>[^<]*<\/title>/, `<title>${meta.title.replace(/&(?!amp;)/g, '&amp;')}</title>`);
const metas = {
  'name="description"': meta.description,
  'property="og:title"': meta.title,
  'property="og:description"': meta.ogDescription,
  'property="og:url"': `${seite}en/`,
  'property="og:locale"': 'en_US',
  'property="og:locale:alternate"': 'de_CH',
  'name="twitter:title"': meta.twitterTitle,
  'name="twitter:description"': meta.twitterDescription,
};
if (meta.keywords) metas['name="keywords"'] = meta.keywords;
for (const [name, value] of Object.entries(metas)) sub(new RegExp(`(<meta ${name} content=")[^"]*"`), `$1${attr(value)}"`);
sub(/(<link rel="canonical" href=")[^"]+"/, `$1${seite}en/"`);
// Strukturierte Daten der App.
sub(/(<script type="application\/ld\+json">)([\s\S]*?"@type": "MobileApplication"[\s\S]*?)(<\/script>)/, (_, a, json, z) =>
  `${a}\n${JSON.stringify({ ...JSON.parse(json), ...meta.ld, url: `${seite}en/` }, null, 2)}\n${z}`);

// 4. Nur für die deutsche Seite gedachte Teile entfernen, Umschalter zeigt zurück auf Deutsch.
html = html.replace(/[ \t]*\/\/ nur-de:start[\s\S]*?\/\/ nur-de:ende\n/g, '');
sub(/(<a id="lang-toggle" href=")en\/(" hreflang=")en(" aria-label=")[^"]*("[^>]*>)[^<]*</, '$1../$2de$3Auf Deutsch wechseln$4DE<');

// 5. Die Seite liegt eine Ebene tiefer: lokale Verweise anpassen.
html = html.replace(/\b(src|href|poster)="(?!https?:|mailto:|#|\/|\.\.\/|data:)([^"]+)"/g, '$1="../$2"');

mkdirSync('en', { recursive: true });
writeFileSync('en/index.html', html);
console.log(`en/index.html geschrieben, ${used.size} Texte`);
