// Bouwt index.html uit src/: voegt parser en categorieën in en zet er een volledig HTML-document omheen.
// Gebruik: node build.js
const fs = require('fs');
const path = require('path');

const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const body = src('app.template.html')
  .replace('/*@parser*/', () => src('parser.js'))
  .replace('/*@categories*/', () => src('categories.js'));

const head = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1c5a61">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-180.png">
<style>[hidden]{display:none!important}body{margin:0}:root{padding-top:env(safe-area-inset-top,0px)}</style>
`;

fs.writeFileSync(path.join(__dirname, 'index.html'), head + body + '\n</html>\n');
console.log('index.html gebouwd (' + Math.round((head + body).length / 1024) + ' KB)');
