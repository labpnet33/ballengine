'use strict';

// Preview-only build of the original, captured BallEngine frontend.
// Do not overwrite the original React UI with a simplified replacement.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const web = path.join(repo, 'extra', 'wget', 'ballengine.app');
const staticCapture = path.join(repo, 'captures', 'studio-browser', 'ballengine.app');
const needed = [
  'assets/index-3pf76ICO.js',
  'assets/index-DoMKM56W.css',
  'assets/vendor-react-kqrIXDwM.js',
  'assets/vendor-motion-EOl-odwX.js',
  'assets/crush.worker-phV1EFRY.js',
  'assets/magnetic.worker-QnwGMRP0.js',
  'assets/physics.worker-DRvxAjdb.js'
];
function verify(name) {
  const file = path.join(web, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size < 1)
    throw new Error('Required original Studio resource missing: ' + file);
}
if (!fs.existsSync(path.join(web, 'studio.html')))
  throw new Error('Original studio.html not present. Refusing to replace it with a rebuilt interface.');
if (!fs.existsSync(staticCapture))
  throw new Error('Curated Studio static assets not present: ' + staticCapture);
const originalStudio = fs.readFileSync(path.join(web,'studio.html'),'utf8');
if (!originalStudio.includes('id="root"') ||
    !originalStudio.includes('index-3pf76ICO.js'))
  throw new Error('studio.html does not contain the expected original React entrypoint.');

let copied=0, already=0;
const protectedPaths=new Set(['studio.html','index.html']);
function walk(folder, relative='') {
  for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const from = path.join(folder,entry.name);
    const rel=path.join(relative,entry.name);
    const to=path.join(web,rel);
    if(entry.isDirectory()) {walk(from,rel);continue;}
    if(!entry.isFile())continue;
    // Curated static files only. Never include HAR, WACZ or captured API bodies.
    if (protectedPaths.has(rel) || rel.startsWith('api'+path.sep))continue;
    fs.mkdirSync(path.dirname(to),{recursive:true});
    if (fs.existsSync(to)) {already++;continue;}
    fs.copyFileSync(from,to);copied++;
  }
}
walk(staticCapture);
needed.forEach(verify);
// Vercel's static output does not apply repository-root rewrites when the
// project Root Directory is nested. Publish /studio/index.html explicitly.
const studioDir=path.join(web,'studio');
fs.mkdirSync(studioDir,{recursive:true});
// Absolute asset paths work both at /studio and /studio/.
const studioDocument=originalStudio
  .replace(/(\\b(?:src|href)=["'])assets\\//g,'$1/assets/');
fs.writeFileSync(path.join(studioDir,'index.html'),studioDocument,'utf8');
const originalBundle=path.join(web,'assets','index-3pf76ICO.js');
const newBundle=path.join(staticCapture,'assets','index-3pf76ICO.js');
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if (digest(originalBundle)!==digest(newBundle))
  throw new Error('Main app bundle differs between original HTML capture and logged-in resources. Review before publishing.');

const soundsDir=path.join(web,'sfx');
const soundCount=fs.readdirSync(soundsDir).filter(n=>n.endsWith('.wav')).length;
if(soundCount<100)throw new Error('Only '+soundCount+' Studio sound effects found; expected over 100.');
const modeDir=path.join(web,'mode-thumbs');
const modeCount=fs.readdirSync(modeDir).filter(n=>n.endsWith('.webp')).length;
if(modeCount<18)throw new Error('Missing Studio mode thumbnail assets.');
console.log('Original Studio build completed (frontend assets only).');
console.log('Additional public static assets copied:',copied);
console.log('Already present:',already);
console.log('Sound effects:',soundCount,'Mode thumbnails:',modeCount);
console.log('Runtime note: authenticated APIs and server-side rendering are not part of this capture.');
