import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createServer } from '../src/server.mjs';
import { RecoveryEngine } from '../src/engine.mjs';

/** DOM integration tests exercise actual UI code + real HTTP, without a browser renderer. */
async function fixture(t, engine = new RecoveryEngine()) {
  const server = createServer({engine});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:base,runScripts:'outside-only'});
  const {window}=dom;
  window.fetch=(url,options)=>fetch(new URL(url,base),options);
  window.HTMLElement.prototype.scrollIntoView=function(){};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  await vm.runInContext(`(async()=>{${source}\n})()`,dom.getInternalVMContext());
  t.after(async()=>{dom.window.close();await new Promise((resolve)=>server.close(resolve));});
  const doc=window.document;
  const find=(id)=>doc.getElementById(id);
  const click=async(selector)=>{
    const element=doc.querySelector(selector); assert.ok(element,`Missing ${selector}`);
    element.click();
    await settle(()=>find('main').getAttribute('aria-busy')!=='true');
  };
  const fill=(id,value)=>{find(id).value=value;find(id).dispatchEvent(new window.Event('input',{bubbles:true}));};
  const approve=async()=>{
    await click('[data-action="approve"]');
    assert.equal(find('approval-dialog').open,true);
    assert.equal(find('approval-confirm').disabled,true);
    find('approval-consent').checked=true;
    find('approval-consent').dispatchEvent(new window.Event('change',{bubbles:true}));
    await click('#approval-confirm');
  };
  return {engine,doc,find,click,fill,approve,base,window};
}
async function settle(predicate){
  const deadline=Date.now()+2500;
  while(!predicate()) {if(Date.now()>deadline) throw new Error('UI did not settle'); await new Promise((resolve)=>setTimeout(resolve,10));}
}

test('UI builds a plan, requires an explicit checkbox, and executes the approved simulation',async(t)=>{
  const {find,click,approve,engine}=await fixture(t);
  await click('#example-button');
  assert.match(find('plan-content').textContent,/\$234/);
  assert.match(find('plan-content').textContent,/12:45 AM/);
  assert.equal(engine.getState().providers.airline.bookings.length,0);
  await approve();
  await click('[data-action="execute"]');
  assert.match(find('status-pill').textContent,/Recovery complete/);
  assert.match(find('plan-content').textContent,/GR-REC-0001/);
  assert.equal(engine.getState().providers.ground.requests,1);
});

test('UI close/back from approval leaves provider state unchanged',async(t)=>{
  const {find,click,engine}=await fixture(t);
  await click('#example-button'); await click('[data-action="approve"]'); await click('#approval-cancel');
  assert.equal(find('approval-dialog').open,false);
  assert.equal(engine.getState().approval,null);
  assert.equal(engine.getState().providers.hotel.protections.length,0);
});

test('UI changed constraints hide execution until a new plan and approval',async(t)=>{
  const {find,click,fill,approve,engine}=await fixture(t);
  await click('#example-button'); await approve();
  fill('budget','400');
  assert.equal(find('action-area').querySelector('[data-action="execute"]'),null);
  await click('#plan-button');
  assert.ok(find('action-area').querySelector('[data-action="approve"]'),'A new plan must be approvable even with an invalidated older approval');
  await approve(); await click('[data-action="execute"]');
  assert.equal(engine.getState().execution.status,'completed');
});

test('UI safely resumes after a lost response, and a new page restores the checkpoint',async(t)=>{
  const engine=new RecoveryEngine();
  const a=await fixture(t,engine);
  await a.click('#example-button'); await a.approve();
  a.find('fault').value='transport-timeout'; await a.click('#inject-button'); await a.click('[data-action="execute"]');
  assert.match(a.find('status-pill').textContent,/Safely paused/);
  const b=await fixture(t,engine);
  assert.match(b.find('status-pill').textContent,/Safely paused/);
  await b.click('[data-action="execute"]');
  assert.equal(engine.getState().providers.ground.requests,1);
  assert.equal(engine.getState().execution.status,'completed');
});

test('UI price change invalidates approval and allows refreshing and reapproving',async(t)=>{
  const {find,click,approve,engine}=await fixture(t);
  await click('#example-button'); await approve();
  find('fault').value='price-change'; await click('#inject-button');
  assert.equal(find('action-area').querySelector('[data-action="execute"]'),null);
  await click('[data-action="replan"]');
  assert.match(find('plan-content').textContent,/\$269/);
  await approve(); await click('[data-action="execute"]');
  assert.equal(engine.getState().execution.status,'completed');
});

test('UI blocked constraints do not offer approval, reset restores an operable empty state',async(t)=>{
  const {find,click,fill,engine}=await fixture(t);
  fill('budget','100'); await click('#plan-button');
  assert.match(find('plan-content').textContent,/No safe plan fits/);
  assert.equal(find('action-area').querySelector('[data-action="approve"]'),null);
  await click('#reset-button'); await click('#reset-cancel');
  assert.equal(engine.getState().constraints.budget,100);
  await click('#reset-button'); await click('#reset-confirm');
  assert.equal(find('budget').value,'300');
  await click('#example-button');
  assert.equal(engine.getState().plan.total,234);
});

test('UI escapes provider and event text instead of inserting HTML',async(t)=>{
  const engine=new RecoveryEngine();
  engine.state.providers.hotel.name='<img src=x onerror="alert(1)">';
  const {find,click}=await fixture(t,engine);
  await click('#example-button');
  assert.equal(find('plan-content').querySelector('img'),null);
  assert.match(find('plan-content').textContent,/<img src=x/);
});


test('UI describes the hotel hold as proposed until a receipt confirms it',async(t)=>{
  const {find,click,approve}=await fixture(t);
  await click('#example-button');
  assert.match(find('plan-content').textContent,/Proposed hold until 2:00 AM/);
  await approve();await click('[data-action="execute"]');
  assert.match(find('plan-content').textContent,/Room held until 2:00 AM/);
  assert.doesNotMatch(find('plan-content').textContent,/Proposed hold/);
});

test('UI labels a same-night arrival correctly',async(t)=>{
  const {find,click,fill}=await fixture(t);
  fill('budget','400');fill('latest-arrival','00:30');await click('#plan-button');
  assert.match(find('plan-content').textContent,/11:55 PM/);
  assert.match(find('plan-content').textContent,/Tonight · Los Angeles time/);
});

test('UI locks boundaries while planning and prevents duplicate clicks',async(t)=>{
  const {find,click,window,engine}=await fixture(t);
  const original=window.fetch;
  let release;
  const gate=new Promise((resolve)=>{release=resolve;});
  window.fetch=async(url,options)=>{if(String(url).endsWith('/plan')) await gate;return original(url,options);};
  find('example-button').click();
  assert.equal(find('budget').disabled,true);
  assert.equal(find('latest-arrival').disabled,true);
  find('example-button').click();
  release();await settle(()=>find('main').getAttribute('aria-busy')!=='true');
  assert.equal(engine.getState().plan.version,1);
  assert.equal(find('budget').disabled,false);
  await click('[data-action="approve"]');
  assert.equal(find('approval-confirm').disabled,true);
});

test('UI recovers a discarded successful HTTP response by checking saved state',async(t)=>{
  const {find,click,approve,window,engine}=await fixture(t);
  await click('#example-button');await approve();
  const original=window.fetch;
  let discard=true;
  window.fetch=async(url,options)=>{
    const response=await original(url,options);
    if(discard && String(url).endsWith('/execute')) {discard=false;await response.text();throw new Error('Simulated response loss');}
    return response;
  };
  await click('[data-action="execute"]');
  assert.equal(engine.getState().execution.status,'completed');
  assert.match(find('global-error').textContent,/saved outcome may already exist/);
  await click('[data-action="reload-state"]');
  assert.equal(find('global-error').hidden,true);
  assert.match(find('status-pill').textContent,/Recovery complete/);
  assert.equal(engine.getState().providers.ground.requests,1);
});
