import { startServerProcess } from './process-harness.mjs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const directory=mkdtempSync(join(tmpdir(),'nightjar-entrypoint-'));
const app=await startServerProcess({stateFile:join(directory,'state.json')});
try {
 const health=await(await fetch(`${app.base}/api/health`)).json();
 const response=await fetch(`${app.base}/mcp`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'nightjar-cli-smoke',version:'1.0.0'}}})});
 const result=await response.json();
 assert.equal(health.ok,true);assert.equal(response.status,200);assert.equal(result.result.protocolVersion,'2025-11-25');
 const evidence={recordedAt:new Date().toISOString(),disclosure:'Actual CLI server subprocess and loopback HTTP client in one execution context; server stopped afterward. No real travel or AI call.',health,mcpStatus:response.status,protocol:result.result.protocolVersion,server:result.result.serverInfo};
 writeFileSync(new URL('../artifacts/entrypoint-smoke.json',import.meta.url),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
} finally {await app.stop();rmSync(directory,{recursive:true,force:true});}
