import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcessCrashProof } from '../scripts/process-crash-proof.mjs';

test('actual CLI process can be killed and a new process reconciles the durable unknown booking', { timeout: 15000 }, async () => {
  const result = await runProcessCrashProof();
  assert.equal(result.success, true);
  const killed = result.stages.find((stage) => stage.name === 'actual-process-killed');
  const restored = result.stages.find((stage) => stage.name === 'new-process-restored');
  assert.equal(killed.exit.signal, 'SIGKILL');
  assert.notEqual(killed.processId, restored.processId);
  assert.equal(result.stages.at(-1).counts.transferCreates, 1);
});
