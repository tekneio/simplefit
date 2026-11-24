#!/usr/bin/env node
// Baut index.html (englisch, Hauptseite) aus de/index.html (deutsch, Quelle für Aufbau und Gestaltung) und
// tools/en.json (englische Texte). Nach jeder Änderung an de/index.html oder en.json im Repo-Wurzelordner aufrufen:
// node tools/build-en.mjs
// index.html und en/index.html (Weiterleitung der alten Adresse) nie von Hand ändern.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const { meta, alts = {}, texts } = JSON.parse(readFileSync('tools/en.json', 'utf8'));
let html = readFileSync('de/index.html', 'utf8');
// Die englische Seite liegt eine Ebene höher als die Quelle: lokale Verweise ohne «../».
html = html.replace(/\b(src|href|poster)="\.\.\//g, '$1="');

function closing(tag, from) {
  const re = new RegExp(`<(/?)${tag}\\b`, 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) { depth += m[1] ? -1 : 1; if (!depth) return m.index; }
  throw new Error(`kein Ende für <${tag}>`);
}
// Wer eine Stelle nicht findet, bricht ab: so fällt auf, wenn sich de/index.html geändert hat.
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
for (const key of Object.keys(texts)) if (!used.has(key)) console.warn(`en.json: «${key}» kommt in de/index.html nicht vor`);

// 2. Bildschirmfotos mit Sprachfassung (data-shot) und ihr Alternativtext.
html = html.replace(/<img\b[^>]*\bdata-shot="[^"]+"[^>]*>/g, img => {
  const en = img.match(/data-alt-en="([^"]*)"/)?.[1];
  img = img.replace(/src="screenshots\/de\//, 'src="screenshots/en/');
  return en === undefined ? img : img.replace(/\balt="[^"]*"/, `alt="${en}"`);
});

// Übrige Bildbeschreibungen und Beschriftungen: en.json «alts», deutscher Wortlaut als Schlüssel.
html = html.replace(/\b(alt|aria-label)="([^"]*)"/g, (all, name, value) => value in alts ? `${name}="${alts[value]}"` : all);

// 3. Kopf: Sprache, Titel, Beschreibungen, Adresse.
const seite = html.match(/<link rel="canonical" href="([^"]+)de\/"/)[1];
sub(/<html lang="de">/, '<html lang="en">');
sub(/<title>[^<]*<\/title>/, `<title>${meta.title.replace(/&(?!amp;)/g, '&amp;')}</title>`);
const metas = {
  'name="description"': meta.description,
  'property="og:title"': meta.title,
  'property="og:description"': meta.ogDescription,
  'property="og:url"': seite,
  'property="og:locale"': 'en_US',
  'property="og:locale:alternate"': 'de_CH',
  'name="twitter:title"': meta.twitterTitle,
  'name="twitter:description"': meta.twitterDescription,
};
if (meta.keywords) metas['name="keywords"'] = meta.keywords;
for (const [name, value] of Object.entries(metas)) sub(new RegExp(`(<meta ${name} content=")[^"]*"`), `$1${attr(value)}"`);
sub(/(<link rel="canonical" href=")[^"]+"/, `$1${seite}"`);
// Strukturierte Daten der App.
sub(/(<script type="application\/ld\+json">)([\s\S]*?"@type": "MobileApplication"[\s\S]*?)(<\/script>)/, (_, a, json, z) =>
  `${a}\n${JSON.stringify({ ...JSON.parse(json), ...meta.ld, url: seite }, null, 2)}\n${z}`);

// 4. Hinweis auf die andere Sprache umdrehen: wer einen deutschen Browser hat, sieht den Weg zur deutschen Fassung
// deutlicher. Der Umschalter zeigt auf de/.
sub(/([ \t]*)\/\/ nur-de:start[\s\S]*?\/\/ nur-de:ende\n/, (_, e) => [
  `// The German version lives at de/. German browsers get a clearer way there.`,
  `if ((navigator.language || 'en').toLowerCase().startsWith('de')) {`,
  `  const de = document.getElementById('lang-toggle');`,
  `  de.textContent = 'Deutsche Version →';`,
  `  de.style.background = 'rgba(255,255,255,0.24)';`,
  `}`,
].map(z => e + z).join('\n') + '\n');
sub(/(<a id="lang-toggle" href=")(" hreflang=")en(" aria-label=")[^"]*("[^>]*>)[^<]*</, '$1de/$2de$3Auf Deutsch wechseln$4DE<');

writeFileSync('index.html', html);

// 5. Alte Adresse en/ leitet auf die Hauptseite weiter.
mkdirSync('en', { recursive: true });
writeFileSync('en/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${meta.title.replace(/&(?!amp;)/g, '&amp;')}</title>
<link rel="canonical" href="${seite}">
<meta http-equiv="refresh" content="0; url=${seite}">
</head>
<body><a href="${seite}">${seite}</a></body>
</html>
`);
console.log(`index.html geschrieben, ${used.size} Texte; en/index.html leitet weiter`);
