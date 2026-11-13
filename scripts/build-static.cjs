'use strict';
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const website = path.join(repo, 'extra', 'wget', 'ballengine.app');
const homePath = path.join(website, 'index.html');
const studioPath = path.join(repo, 'guest-studio.html');
for (const p of [homePath, studioPath]) if (!fs.existsSync(p)) throw new Error('Missing input: ' + p);

// Vercel project Root Directory is extra/wget/ballengine.app.
// Prepare a publishable site IN that directory instead of creating a separate dist.
let homepage = fs.readFileSync(homePath, 'utf8');
const originalBundle = /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["'][^"']*assets\/index-[^"']+\.js["'])[^>]*><\/script>/gi;
const count = (homepage.match(originalBundle) || []).length;
homepage = homepage.replace(originalBundle, '');
homepage = homepage.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, '');
homepage = homepage.replace(/href=["']start\.html["']/gi, 'href="/studio"');
homepage = homepage.replace(/<a\b[^>]*href=["'](?:login|signup)(?:\.html)?["'][^>]*>[\s\S]*?<\/a>/gi, '');
fs.writeFileSync(homePath, homepage);

const guest = fs.readFileSync(studioPath, 'utf8');
fs.mkdirSync(path.join(website, 'studio'), { recursive: true });
fs.writeFileSync(path.join(website, 'studio.html'), guest);
fs.writeFileSync(path.join(website, 'studio', 'index.html'), guest);

// Clear service workers left by the captured upstream site.
fs.writeFileSync(path.join(website, 'sw.js'),
  'self.addEventListener("install",()=>self.skipWaiting());\n'+
  'self.addEventListener("activate",e=>e.waitUntil((async()=>{for(const k of await caches.keys())await caches.delete(k);await self.registration.unregister();await self.clients.claim()})()));\n'
);

// All former auth entrypoints must resolve to the guest studio, including direct visits.
const guestRedirect = '<!doctype html><html><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta http-equiv="refresh" content="0; url=/studio">'+
  '<title>Opening Guest Studio</title></head><body style="background:#09090b;color:#fafafa;font-family:system-ui;padding:24px">'+
  '<p>Opening the guest studio… <a style="color:#22d3ee" href="/studio">Continue to studio</a></p>'+
  '<script>window.location.replace("/studio");<\/script></body></html>';
for (const entry of ['signup', 'login', 'start']) {
  const directory = path.join(website, entry);
  fs.mkdirSync(directory, { recursive:true });
  fs.writeFileSync(path.join(directory, 'index.html'), guestRedirect);
  fs.writeFileSync(path.join(website, entry + '.html'), guestRedirect);
}

const required = ['index.html', 'studio.html', 'studio/index.html', 'assets/index-DoMKM56W.css'];
for(const item of required) if(!fs.existsSync(path.join(website, item))) throw new Error('Missing public file: ' + item);
console.log('Guest preview files prepared in configured Vercel Root Directory.');
console.log('Removed captured SPA entry bundles:', count);
console.log('Published HTML bytes:', fs.statSync(homePath).size, fs.statSync(path.join(website,'studio.html')).size);
console.log('Published directory entries:', fs.readdirSync(website).length);
