import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createServer } from '../src/server.mjs';
import { RecoveryEngine } from '../src/engine.mjs';

async function fixture(t) {
  const server = createServer({engine:new RecoveryEngine()});
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async(path,input={}) => {
    const response = await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    return {status:response.status,body:await response.json()};
  };
  return {base,post};
}

test('HTTP serves the product and explicitly labels simulation',async(t)=>{
  const {base}=await fixture(t);
  const response=await fetch(base);
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html,/SIMULATED EXPERIENCE/);
  assert.match(html,/no microphone or live AI/);
  assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
  const health=await(await fetch(`${base}/api/health`)).json();
  assert.equal(health.externalCalls,false);
});

test('HTTP happy path requires approval, finishes once, and exports evidence',async(t)=>{
  const {base,post}=await fixture(t);
  const {body:planned}=await post('plan',{budget:300,latestArrival:'01:00'});
  const version=planned.plan.version;
  assert.equal(planned.plan.total,234);
  const blocked=await post('execute',{planVersion:version});
  assert.equal(blocked.body.execution.lastError.code,'APPROVAL_REQUIRED');
  await post('approve',{planVersion:version,maxTotal:234});
  const {body:done}=await post('execute',{planVersion:version});
  assert.equal(done.execution.status,'completed');
  const {body:repeat}=await post('execute',{planVersion:version});
  assert.equal(repeat.providers.ground.bookings.length,1);
  const evidence=await fetch(`${base}/api/evidence`);
  assert.match(evidence.headers.get('content-disposition'),/attachment/);
  assert.match((await evidence.json()).disclosure,/Synthetic/);
});

test('HTTP recovers lost supplier response without another reservation',async(t)=>{
  const {post}=await fixture(t);
  const {body:p}=await post('plan');
  await post('approve',{planVersion:p.plan.version,maxTotal:p.plan.total});
  await post('inject',{kind:'transport-timeout'});
  const {body:failed}=await post('execute',{planVersion:p.plan.version});
  assert.equal(failed.execution.status,'needs-retry');
  const {body:recovered}=await post('execute',{planVersion:p.plan.version});
  assert.equal(recovered.execution.status,'completed');
  assert.equal(recovered.providers.ground.requests,1);
  assert.equal(recovered.providers.ground.reconciliationRequests,1);
});

test('HTTP rejects stale approval after supplier price change',async(t)=>{
  const {post}=await fixture(t);
  const {body:p}=await post('plan');
  await post('approve',{planVersion:p.plan.version,maxTotal:p.plan.total});
  await post('inject',{kind:'price-change'});
  const {body:blocked}=await post('execute',{planVersion:p.plan.version});
  assert.equal(blocked.execution.status,'blocked');
  assert.equal(blocked.providers.hotel.protections.length,0);
});

test('HTTP rejects malformed JSON and invalid constraints cleanly',async(t)=>{
  const {base,post}=await fixture(t);
  const malformed=await fetch(`${base}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{no'});
  assert.equal(malformed.status,400);
  assert.equal((await post('plan',{budget:-1})).status,400);
  assert.equal((await post('plan',{accessibility:'yes'})).status,400);
  assert.equal((await post('plan',[])).status,400);
  assert.equal((await post('plan',null)).status,400);
});

test('HTTP refuses cross-origin mutations, non-JSON bodies, and oversized input',async(t)=>{
  const {base}=await fixture(t);
  const cross=await fetch(`${base}/api/reset`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://untrusted.invalid'},body:'{}'});
  assert.equal(cross.status,403);
  const plain=await fetch(`${base}/api/reset`,{method:'POST',body:'{}'});
  assert.equal(plain.status,415);
  const large=await fetch(`${base}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:'x'.repeat(17000)})});
  assert.equal(large.status,413);
});

test('HTTP does not expose runtime state files or source files',async(t)=>{
  const {base}=await fixture(t);
  for(const path of ['/src/engine.mjs','/.runtime/state.json','/../package.json','/api/missing']) {
    assert.equal((await fetch(base+path)).status,404);
  }
});

test('HTTP rejects unrelated Host authorities to resist DNS rebinding',async(t)=>{
  const {base}=await fixture(t);
  const status=await new Promise((resolve,reject)=>{
    const req=request(`${base}/api/state`,{headers:{Host:'untrusted.invalid'}},(res)=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.end();
  });
  assert.equal(status,403);
});
