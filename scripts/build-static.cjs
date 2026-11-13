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
const required = ['index.html', 'studio.html', 'studio/index.html', 'assets/index-DoMKM56W.css'];
for(const item of required) if(!fs.existsSync(path.join(website, item))) throw new Error('Missing public file: ' + item);
console.log('Guest preview files prepared in configured Vercel Root Directory.');
console.log('Removed captured SPA entry bundles:', count);
console.log('Published HTML bytes:', fs.statSync(homePath).size, fs.statSync(path.join(website,'studio.html')).size);
console.log('Published directory entries:', fs.readdirSync(website).length);
