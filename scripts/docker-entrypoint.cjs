'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

for (const [name, file] of Object.entries(process.env)) {
  if (!name.endsWith('_FILE') || !file) continue;

  const secretName = name.slice(0, -'_FILE'.length);
  const secret = fs.readFileSync(file, 'utf8').replace(/[\r\n]+$/, '');
  if (!secret) throw new Error(`Secret file for ${secretName} is empty`);

  process.env[secretName] = secret;
  delete process.env[name];
}

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Container command is missing');

const child = spawn(command, args, { env: process.env, stdio: 'inherit' });
child.on('error', (error) => {
  console.error(`Failed to start container command: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
