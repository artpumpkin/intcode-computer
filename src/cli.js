#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { Computer, parseProgram } from './computer.js';

const [filename, ...rawInputs] = process.argv.slice(2);
if (!filename || filename === '--help') {
  console.log('Usage: node src/cli.js <program.csv> [integer inputs...]');
  if (!filename) process.exitCode = 1;
} else {
  try {
    const file = await open(filename, 'r');
    let text;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 1_048_576) {
        throw new Error('Program must be a regular file no larger than 1 MiB');
      }
      // Read at most the limit plus one byte, even if the file grows after stat.
      const buffer = Buffer.alloc(1_048_577);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > 1_048_576) throw new Error('Program exceeds 1 MiB');
      text = buffer.toString('utf8', 0, length);
    } finally {
      await file.close();
    }
    const inputs = rawInputs.map(input => {
      const parsed = parseProgram(input);
      if (parsed.length !== 1) throw new Error('Each input argument must be one integer');
      return parsed[0];
    });
    const result = new Computer(parseProgram(text), inputs).run();
    for (const output of result.outputs) process.stdout.write(`${output}\n`);
    if (result.status === 'waiting') {
      console.error('Program needs more input. Supply all inputs as command arguments.');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
