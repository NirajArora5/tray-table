// Stage the game for the native shells: copy the plain files Capacitor needs into www/ (gitignored).
// index.html stays the single source of truth; nothing is transformed. sw.js is left out on purpose: the native
// shells serve from local files already, so the service worker has nothing to cache.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
const FILES = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(out, f));
console.log('www/: ' + FILES.join(', '));
