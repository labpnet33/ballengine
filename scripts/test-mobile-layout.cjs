'use strict';
/*
 * Local post-build mobile smoke test for the EXISTING BallEngine routes.
 * Usage:
 *   node scripts/build-original-studio.cjs
 *   CHROME_BIN=/usr/bin/chromium node scripts/test-mobile-layout.cjs
 * Screenshots/results are local only; no production deployment is changed.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright-core');
const web=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const output=path.resolve(__dirname,'..','test-results','mobile');
fs.mkdirSync(output,{recursive:true});

const routes=['/home','/studio','/automation/accounts','/automation/publish','/automation/autopilot','/plans.html'];
const widths=[320,390,768,1280];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'};
const srv=http.createServer((req,res)=>{
  try{
    let pathname=new URL(req.url,'http://localhost').pathname;
    let relative=decodeURIComponent(pathname).replace(/^\/+/, '');
    if(!relative)relative='index.html';
    if(!path.extname(relative))relative+='/index.html';
    const file=path.resolve(web,relative);
    if(!file.startsWith(web+path.sep))return res.writeHead(403).end();
    fs.readFile(file,(err,data)=>{
      if(err)return res.writeHead(404).end();
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
      res.end(data);
    });
  }catch{res.writeHead(400).end();}
});
(async()=>{
  for(const file of ['home/index.html','studio/index.html','automation/accounts/index.html','automation/publish/index.html','automation/autopilot/index.html','plans.html']){
    assert.ok(fs.existsSync(path.join(web,file)),'Missing built page '+file);
    assert.match(fs.readFileSync(path.join(web,file),'utf8'),/data-ballengine-mobile="v1"/);
  }
  await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+srv.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const report=[],failures=[];
  try{
    for(const width of widths){
      const context=await browser.newContext({
        viewport:{width,height:width===1280?800:width===768?1024:780},
        isMobile:width<768,hasTouch:width<768,deviceScaleFactor:1,serviceWorkers:'block'
      });
      const page=await context.newPage();
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
      for(const route of routes){
        if(width===1280 && !['/home','/studio','/automation/accounts'].includes(route))continue;
        await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:45000});
        await page.locator('link[data-ballengine-mobile="v1"]').waitFor({state:'attached',timeout:15000});
        const measurement=await page.evaluate(()=>{
          const nav=document.querySelector('nav[aria-label="Automation"]');
          const body=document.body,doc=document.documentElement;
          const main=document.querySelector('#root main')||document.querySelector('#root')||body;
          const panel=document.createElement('section');
          panel.setAttribute('data-be-social-panel','1');
          panel.style.cssText='width:600px;min-width:600px;padding:18px;display:block';
          const input=document.createElement('input');input.type='text';
          input.style.cssText='font-size:13px;width:600px';
          const button=document.createElement('button');button.textContent='Connect account';
          button.style.cssText='height:28px;padding:0';
          panel.append(input,button);
          main.append(panel);
          const sheet=[...document.querySelectorAll('link[rel="stylesheet"]')].find(el=>el.href.endsWith('/ballengine-mobile.css'));
          const panelWidth=panel.getBoundingClientRect().width;
          const font=parseFloat(getComputedStyle(input).fontSize);
          const buttonHeight=button.getBoundingClientRect().height;
          const rail=nav?getComputedStyle(nav).scrollSnapType:null;
          panel.remove();
          return {viewport:innerWidth,scrollWidth:doc.scrollWidth,bodyScrollWidth:body.scrollWidth,hasMobileCSS:!!sheet,
            panelWidth,font,buttonHeight,navSnap:rail,
            canvasTouch:[...document.querySelectorAll('.game-stage canvas')].map(el=>getComputedStyle(el).touchAction)};
        });
        report.push({route,width,...measurement});
        if(!measurement.hasMobileCSS)failures.push(route+' '+width+' stylesheet missing');
        if(width<=767){
          if(measurement.panelWidth>width+2)failures.push(route+' '+width+' panel overflows '+measurement.panelWidth);
          if(measurement.font<16)failures.push(route+' '+width+' focus input font below 16px');
          if(measurement.buttonHeight<44)failures.push(route+' '+width+' touch target below 44px');
          if(measurement.navSnap && !measurement.navSnap.startsWith('x '))failures.push(route+' '+width+' scroll rail snap missing');
        }
        if(width===390 && ['/home','/studio','/automation/accounts'].includes(route))
          await page.screenshot({path:path.join(output,route.replaceAll('/','-')+'-'+width+'.png'),fullPage:false}).catch(()=>{});
      }
      await context.close();
    }
  }finally{await browser.close();}
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({report,failures},null,2));
  console.log('Mobile layout measurements:',JSON.stringify(report));
  assert.deepEqual(failures,[],'Responsive UI checks failed');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>srv.close());
