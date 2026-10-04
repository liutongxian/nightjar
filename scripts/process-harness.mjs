import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Start this project's actual CLI in an isolated child process and await its bound port. */
export async function startServerProcess({ stateFile, timeoutMs = 5000 }) {
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: '0', NIGHTJAR_STATE_FILE: stateFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  let timer;
  const ready = new Promise((resolve, reject) => {
    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const match = stdout.match(/Nightjar simulation: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', reject);
    exited.then(({ code, signal }) => reject(new Error(`Server exited before readiness: ${code ?? signal}. ${stderr.trim()}`)));
    timer = setTimeout(() => reject(new Error('Server startup timed out')), timeoutMs);
  });
  try {
    const base = await ready;
    return {
      child, base,
      async stop(signal = 'SIGTERM') {
        if (child.exitCode === null && child.signalCode === null) child.kill(signal);
        return exited;
      },
    };
  } catch (error) {
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    throw error;
  } finally { clearTimeout(timer); }
}
