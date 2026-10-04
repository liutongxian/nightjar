import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createServer } from '../src/server.mjs';
import { RecoveryEngine } from '../src/engine.mjs';

const server=createServer({engine:new RecoveryEngine()});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:base,runScripts:'outside-only'});
const {window}=dom;
window.fetch=(url,options)=>fetch(new URL(url,base),options);
window.HTMLElement.prototype.scrollIntoView=function(){};
try {
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  await vm.runInContext(`(async()=>{${source}\n})()`,dom.getInternalVMContext());
  window.document.querySelector('#example-button').click();
  while(window.document.querySelector('#main').getAttribute('aria-busy')==='true') await new Promise((resolve)=>setTimeout(resolve,5));
  const doc=window.document;
  doc.querySelectorAll('script,link[rel="stylesheet"],link[rel="icon"]').forEach((node)=>node.remove());
  doc.querySelectorAll('button,input,select').forEach((node)=>{node.setAttribute('disabled','');});
  doc.querySelectorAll('a').forEach((node)=>{node.removeAttribute('href');});
  const style=doc.createElement('style');style.textContent=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');doc.head.append(style);
  const label=doc.createElement('div');label.textContent='READ-ONLY EXPORT · Synthetic plan from the running code · Controls disabled · Not a browser-verified screenshot';label.setAttribute('style','padding:12px 20px;background:#b7f6d4;color:#102d39;text-align:center;font:600 12px system-ui;');doc.body.prepend(label);
  doc.querySelector('#toast').remove();
  mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
  writeFileSync(new URL('../artifacts/nightjar-preview.html',import.meta.url),dom.serialize());
  console.log('Wrote artifacts/nightjar-preview.html (standalone read-only HTML, not visually verified).');
} finally {dom.window.close();await new Promise((resolve)=>server.close(resolve));}
