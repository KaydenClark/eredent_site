import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('a second preview refuses an occupied port instead of starting another server', async () => {
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  const port = occupied.address().port;
  const root = fileURLToPath(new URL('../', import.meta.url));
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = setTimeout(() => child.kill(), 5000);
  try {
    const [code] = await once(child, 'exit');
    assert.ok(code !== null && code !== 0, `Expected a refused duplicate preview. Output:\n${output}`);
    assert.match(output, new RegExp(`Port ${port} is already in use`));
  } finally {
    clearTimeout(deadline);
    child.kill();
    await new Promise(resolve => occupied.close(resolve));
  }
});
