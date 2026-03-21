#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const slides = require('./assets/js/slides-list.js');

const slidesHtml = slides
  .map(name => {
    const filePath = path.join(__dirname, 'slides', `${name}.html`);
    return fs.readFileSync(filePath, 'utf8').trim();
  })
  .join('\n');

let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Inline slides into .slides container
html = html.replace(
  /(<div class="slides">)[\s\S]*?(<\/div>)/,
  `$1\n${slidesHtml}\n        $2`
);

// Remove slide-loader.js and replace with direct Reveal.initialize call
html = html.replace(
  /\s*<script src="assets\/js\/slide-loader\.js"><\/script>\n?/,
  '\n    <script>document.addEventListener("DOMContentLoaded", function () { Reveal.initialize(revealConfig); });</script>\n'
);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });

// Copy assets
['assets', 'slides'].forEach(dir => {
  cpDir(path.join(__dirname, dir), path.join(__dirname, 'dist', dir));
});

fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(__dirname, 'remote.html'), path.join(__dirname, 'dist', 'remote.html'));
fs.copyFileSync(path.join(__dirname, 'audience.html'), path.join(__dirname, 'dist', 'audience.html'));
fs.copyFileSync(path.join(__dirname, '.nojekyll'), path.join(__dirname, 'dist', '.nojekyll'));

console.log('Build complete → dist/index.html');

function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) cpDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
