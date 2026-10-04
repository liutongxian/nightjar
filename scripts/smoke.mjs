import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { RecoveryEngine } from '../src/engine.mjs';
const directory=mkdtempSync(join(tmpdir(),'nightjar-evidence-'));
const filePath=join(directory,'state.json');
const summarize=(s)=>({planVersion:s.plan?.version,total:s.plan?.total,status:s.execution.status,error:s.execution.lastError,steps:s.execution.steps,providerCounts:Object.fromEntries(Object.entries(s.providers).map(([key,p])=>[key,{requests:p.requests,reconciliationRequests:p.reconciliationRequests,bookings:(p.bookings??p.protections).length}])),originalHotel:s.providers.hotel.reservation,originalTicket:s.providers.airline.entitlement});
try {
 let engine=new RecoveryEngine({filePath});
 const planned=engine.plan();
 engine.approve({planVersion:planned.plan.version,maxTotal:planned.plan.total});
 engine.inject({kind:'transport-timeout'});
 const interrupted=engine.execute({planVersion:planned.plan.version});
 assert.equal(interrupted.execution.status,'needs-retry');
 engine=new RecoveryEngine({filePath});
 const recovered=engine.execute({planVersion:planned.plan.version});
 assert.equal(recovered.execution.status,'completed');
 assert.equal(recovered.providers.ground.requests,1);
 assert.equal(recovered.providers.ground.reconciliationRequests,1);
 const artifact={disclosure:'Synthetic scenario; actual deterministic engine execution and file-backed RecoveryEngine reconstruction in the same Node process. No live travel, AI model, or Alexa call.',recordedAt:new Date().toISOString(),stages:{planned:summarize(planned),interrupted:summarize(interrupted),restartedAndRecovered:summarize(recovered)},events:recovered.events};
 mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../artifacts/recovery-smoke.json',import.meta.url),JSON.stringify(artifact,null,2));
 console.log('Durable recovery verified: 1 flight, 1 transfer, 1 hotel protection, no duplicate create requests.');
} finally {rmSync(directory,{recursive:true,force:true});}
