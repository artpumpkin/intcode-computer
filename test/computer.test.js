import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Computer, parseProgram } from '../src/computer.js';

const execute = (program, inputs) => new Computer(program, inputs).run().outputs;

test('adds, multiplies and reads position-mode memory', () => {
  const machine = new Computer([1101,12,8,20,1002,20,3,20,4,20,99]);
  assert.deepEqual(machine.run().outputs, [60]);
  assert.equal(machine.read(20), 60);
});
test('zero-fills unwritten sparse memory without allocating a giant array', () => {
  const machine = new Computer([4,999999999,99]);
  assert.deepEqual(machine.run().outputs, [0]);
  assert.equal(machine.read(900000000), 0);
});
test('pauses for input and resumes at the same instruction', () => {
  const machine = new Computer([3,20,4,20,3,21,4,21,99]);
  assert.equal(machine.run().status, 'waiting');
  assert.deepEqual(machine.addInput(17).run().outputs, [17]);
  assert.deepEqual(machine.addInput(-8).run(), { status: 'halted', outputs: [-8], steps: 3 });
  assert.equal(machine.halted, true);
  assert.deepEqual(machine.run(), { status: 'halted', outputs: [], steps: 0 });
});
test('supports relative-mode input and output', () => {
  assert.deepEqual(execute([109,40,203,-2,204,-2,99], [123]), [123]);
});
test('supports a negative relative base when the resulting address is valid', () => {
  assert.deepEqual(execute([109,-2,204,2,99]), [109]);
});
test('comparisons write either one or zero', () => {
  assert.deepEqual(execute([1107,5,9,30,4,30,1108,9,9,30,4,30,1108,2,3,30,4,30,99]), [1,1,0]);
});
for (const [opcode, condition, expected] of [[5,1,77],[5,0,33],[6,0,77],[6,1,33]]) {
  test(`jump opcode ${opcode} with condition ${condition}`, () => {
    assert.deepEqual(execute([1100+opcode,condition,6,104,33,99,104,77,99]), [expected]);
  });
}
test('caller-owned program and inputs remain unchanged', () => {
  const program = [3,0,4,0,99], inputs = [8];
  execute(program, inputs);
  assert.deepEqual(program, [3,0,4,0,99]);
  assert.deepEqual(inputs, [8]);
});
test('detects infinite loops using the instruction budget', () => {
  assert.throws(() => new Computer([1105,1,0]).run({ maxSteps: 50 }), /exceeded 50/);
});
test('rejects invalid opcodes, destination modes, and negative addresses', () => {
  for (const program of [[42],[103,0,99],[4,-1,99],[1105,1,-1],[109,-5,204,0,99],[304,0,99]]) {
    assert.throws(() => execute(program, [1]));
  }
});
test('rejects precision loss instead of returning a rounded answer', () => {
  assert.throws(() => execute([1101,Number.MAX_SAFE_INTEGER,1,20,99]), /safe integer/);
  assert.throws(() => parseProgram('9007199254740992'), /safe integer/);
});
test('parses signs and whitespace but rejects malformed input', () => {
  assert.deepEqual(parseProgram(' +12, -3,99\n'), [12,-3,99]);
  for (const raw of ['', ' ', '1,,99', '1e2,99', '0x10,99', '1.5,99', '1,99,']) {
    assert.throws(() => parseProgram(raw));
  }
});
test('validates constructor, input and execution limits', () => {
  for (const program of [[], [NaN], [Infinity], new Array(1), '99']) {
    assert.throws(() => new Computer(program));
  }
  assert.throws(() => new Computer([99], null));
  assert.throws(() => new Computer([99]).addInput(1.2));
  assert.throws(() => new Computer([99]).run({ maxSteps: 0 }));
});
test('CLI example prints 42 and missing input returns a distinct failure', () => {
  const success = spawnSync(process.execPath, ['src/cli.js','examples/double.csv','21'], { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stdout.trim(), '42');
  const waiting = spawnSync(process.execPath, ['src/cli.js','examples/double.csv'], { encoding: 'utf8' });
  assert.equal(waiting.status, 2);
  assert.match(waiting.stderr, /more input/);
});
test('CLI rejects malformed numeric arguments and non-file input', () => {
  for (const args of [['examples/double.csv','21,22'], ['examples/double.csv','oops'], ['.']]) {
    assert.equal(spawnSync(process.execPath, ['src/cli.js',...args]).status, 1);
  }
});
