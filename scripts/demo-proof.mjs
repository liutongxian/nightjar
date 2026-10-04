/** Actual MCP/HTTP proof run with explicitly synthetic approval fixtures. Not a video. */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from '../src/server.mjs';
import { RecoveryEngine } from '../src/engine.mjs';

const directory=mkdtempSync(join(tmpdir(),'nightjar-demo-proof-'));
const filePath=join(directory,'state.json');
const evidence={generatedAt:new Date().toISOString(),disclosure:'Actual official-SDK MCP and HTTP run. All suppliers, faults, money and approval decisions are synthetic test fixtures. No human approval, browser screen recording, Alexa integration or LLM call is claimed.',steps:[],httpExchanges:[],success:false};
const lines=['NIGHTJAR — REPRODUCIBLE CLI PROOF','Real MCP Streamable HTTP. Synthetic travel and approval fixtures.','This transcript is generated from execution, not a demo video.',''];
let server,client,base;
const counts=(s)=>({hotel:s.providers.hotel.protections.length,flights:s.providers.airline.bookings.length,transfers:s.providers.ground.bookings.length,transferCreateRequests:s.providers.ground.requests,transferLookups:s.providers.ground.reconciliationRequests});
function record(title,detail){const index=evidence.steps.length+1;evidence.steps.push({index,title,...detail});const text=`${String(index).padStart(2,'0')}. ${title}\n    ${JSON.stringify(detail)}`;lines.push(text);console.log(text);}
async function start(){
 const engine=new RecoveryEngine({filePath});server=createServer({engine});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
 client=new Client({name:'nightjar-demo-proof',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{fetch:async(input,init)=>{
  const request=new Request(input,init);const requestBody=await request.clone().text();
  const response=await fetch(request);const responseText=await response.clone().text();
  let body;try{body=JSON.parse(requestBody);}catch{body={};}
  let result;try{result=JSON.parse(responseText);}catch{result={};}
  evidence.httpExchanges.push({sequence:evidence.httpExchanges.length+1,method:body.method??'notification',tool:body.params?.name??null,status:response.status,protocolVersion:result.result?.protocolVersion??null,isError:result.result?.isError??false});
  return response;
 }}));
}
async function stop(){if(client)await client.close();if(server){server.closeAllConnections();await new Promise((resolve)=>server.close(resolve));}client=null;server=null;}
async function call(name,input={}){const result=await client.callTool({name,arguments:input});return {result,state:result.structuredContent?.state};}
async function post(path,input){const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(response.status,200);return response.json();}
async function approvalFixture(plan){await post('approve',{planVersion:plan.version,maxTotal:plan.total});record('Synthetic approval fixture applied through the separate HTTP workflow',{planVersion:plan.version,limit:plan.total,source:'automated test fixture, not an MCP tool or a real human decision'});}

try {
 console.log(lines.join('\n'));
 await start();
 const protocol=evidence.httpExchanges.find((x)=>x.protocolVersion)?.protocolVersion;
 assert.equal(protocol,'2025-11-25');
 const toolNames=(await client.listTools()).tools.map((tool)=>tool.name);
 assert.deepEqual([...toolNames].sort(),['execute_recovery','get_recovery_state','plan_recovery']);
 record('Initialized official MCP client and discovered tools',{protocol,toolNames,approvalTool:false});
 const planned=await call('plan_recovery',{budget:300,latestArrival:'01:00'});
 assert.equal(planned.state.plan.total,234);
 record('Planned one connected recovery',{version:planned.state.plan.version,total:planned.state.plan.total,arrival:planned.state.plan.arrivalAt,counts:counts(planned.state)});
 const blocked=await call('execute_recovery',{planVersion:planned.state.plan.version});
 assert.equal(blocked.result.isError,true);assert.equal(blocked.state.execution.lastError.code,'APPROVAL_REQUIRED');
 assert.equal(counts(blocked.state).flights,0);
 record('Execution without approval was blocked',{code:blocked.state.execution.lastError.code,counts:counts(blocked.state)});
 await approvalFixture(planned.state.plan);
 await post('inject',{kind:'transport-timeout'});
 const interrupted=await call('execute_recovery',{planVersion:planned.state.plan.version});
 assert.equal(interrupted.state.execution.status,'needs-retry');
 record('Supplier saved one transfer but its response was lost',{status:interrupted.state.execution.status,steps:interrupted.state.execution.steps.map((step)=>({id:step.id,status:step.status,receipt:step.reference})),counts:counts(interrupted.state)});
 await stop();await start();
 const restored=await call('get_recovery_state');assert.equal(restored.state.execution.status,'needs-retry');
 record('Restarted HTTP app and reconstructed engine from disk',{status:restored.state.execution.status,counts:counts(restored.state),restartBoundary:'new HTTP server and RecoveryEngine instance; same Node process'});
 const recovered=await call('execute_recovery',{planVersion:restored.state.plan.version});
 assert.equal(recovered.state.execution.status,'completed');assert.equal(recovered.state.providers.ground.requests,1);assert.equal(recovered.state.providers.ground.reconciliationRequests,1);
 record('Reconciled the existing transfer without creating another',{status:recovered.state.execution.status,receipts:recovered.state.execution.steps.map((step)=>step.reference),counts:counts(recovered.state)});
 const repeat=await call('execute_recovery',{planVersion:recovered.state.plan.version});assert.deepEqual(counts(repeat.state),counts(recovered.state));
 record('Repeated execution leaves supplier counts unchanged',{counts:counts(repeat.state)});
 await post('reset',{});
 const fresh=await call('plan_recovery',{budget:300,latestArrival:'01:00'});await approvalFixture(fresh.state.plan);
 await post('inject',{kind:'price-change'});
 const stale=await call('execute_recovery',{planVersion:fresh.state.plan.version});assert.equal(stale.result.isError,true);assert.equal(stale.state.approval.status,'invalidated');
 const repriced=await call('plan_recovery');assert.equal(repriced.state.plan.total,269);
 record('Transfer repricing requires a new plan and fresh consent',{oldVersion:fresh.state.plan.version,newVersion:repriced.state.plan.version,newTotal:repriced.state.plan.total,oldApprovalStatus:repriced.state.approval.status,counts:counts(repriced.state)});
 evidence.success=true;lines.push('','PASS: real protocol calls, separate consent boundary, durable recovery, no duplicate creates.','All approval actions above were automated synthetic fixtures. This is not a public demo video.');
} catch(error){evidence.failure=error.message;lines.push(`FAIL: ${error.message}`);process.exitCode=1;}
finally {
 await stop();rmSync(directory,{recursive:true,force:true});
 mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../artifacts/demo-proof.json',import.meta.url),JSON.stringify(evidence,null,2));
 writeFileSync(new URL('../artifacts/demo-transcript.txt',import.meta.url),lines.join('\n')+'\n');
 console.log(evidence.success?'Proof run passed; transcript and JSON saved.':'Proof run failed; inspect evidence.');
}
