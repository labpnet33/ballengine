'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'extra', 'wget', 'ballengine.app');
const out = path.join(root, 'dist');
const homeFile = path.join(source, 'index.html');
const guestFile = path.join(root, 'guest-studio.html');

for (const p of [homeFile, guestFile]) {
  if (!fs.existsSync(p)) throw new Error('Required source file missing: ' + p);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(source, out, { recursive: true });
let homepage = fs.readFileSync(homeFile, 'utf8');

// The original browser bundle contains the captured site's sign-in gate.
// Keep the pre-rendered landing page intact; serve a separate original guest editor.
homepage = homepage.replace(/<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["'][^"']*assets\/index-[^"']+\.js["'])[^>]*><\/script>/gi, '');
homepage = homepage.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, '');
homepage = homepage.replace(/href=["']start\.html["']/gi, 'href="/studio"');
homepage = homepage.replace(/<a\b[^>]*href=["'](?:login|signup)(?:\.html)?["'][^>]*>[\s\S]*?<\/a>/gi, '');
homepage = homepage.replace(/<a\b[^>]*href=["'](?:\/)?start["'][^>]*>/gi, '<a href="/studio">');
fs.writeFileSync(path.join(out, 'index.html'), homepage);

const guest = fs.readFileSync(guestFile, 'utf8');
fs.mkdirSync(path.join(out, 'studio'), { recursive: true });
fs.writeFileSync(path.join(out, 'studio', 'index.html'), guest);
fs.writeFileSync(path.join(out, 'studio.html'), guest);
fs.writeFileSync(path.join(out, 'guest-studio.html'), guest);

// Stop a captured service worker from restoring stale auth-required navigation.
fs.writeFileSync(path.join(out, 'sw.js'),
  'self.addEventListener("install",()=>self.skipWaiting());\n'+
  'self.addEventListener("activate",e=>e.waitUntil((async()=>{for(const k of await caches.keys()) await caches.delete(k); await self.registration.unregister(); await self.clients.claim()})()));\n'
);
const required = ['index.html', 'studio.html', 'studio/index.html', 'assets/index-DoMKM56W.css'];
for (const item of required) if (!fs.existsSync(path.join(out, item))) throw new Error('Missing published asset: ' + item);
console.log('Static output built at dist/ with homepage, standalone studio and captured assets.');
console.log('Homepage bytes: ' + fs.statSync(path.join(out, 'index.html')).size);
console.log('Guest studio bytes: ' + fs.statSync(path.join(out, 'studio.html')).size);
console.log('Published top-level files: ' + fs.readdirSync(out).length);
