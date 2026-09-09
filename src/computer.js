/** A resumable Intcode interpreter, extracted from my 2019 puzzle solutions. */
function integer(value, label = 'Value') {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
  return value;
}

function address(value) {
  integer(value, 'Address');
  if (value < 0) throw new RangeError('Address must be non-negative');
  return value;
}

export class Computer {
  #memory = new Map();
  #inputs = [];
  #pointer = 0;
  #relativeBase = 0;
  #halted = false;

  constructor(program, inputs = []) {
    if (!Array.isArray(program) || program.length === 0) {
      throw new TypeError('Program must be a non-empty array');
    }
    // Array.from visits sparse slots, so holes cannot silently become instructions.
    Array.from(program).forEach((value, index) => this.#write(index, value));
    if (!Array.isArray(inputs)) throw new TypeError('Inputs must be an array');
    this.addInput(...inputs);
  }

  get halted() { return this.#halted; }

  read(location) {
    return this.#memory.get(address(location)) ?? 0;
  }

  #write(location, value) {
    address(location);
    integer(value);
    if (value === 0) this.#memory.delete(location);
    else this.#memory.set(location, value);
  }

  addInput(...values) {
    values.forEach(value => integer(value, 'Input'));
    this.#inputs.push(...values);
    return this;
  }

  #mode(instruction, parameter) {
    return Math.floor(instruction / (10 ** (parameter + 1))) % 10;
  }

  #position(instruction, parameter) {
    const raw = this.read(this.#pointer + parameter);
    const mode = this.#mode(instruction, parameter);
    if (mode === 0) return address(raw);
    if (mode === 2) return address(this.#relativeBase + raw);
    throw new Error(`Invalid destination mode ${mode}`);
  }

  #value(instruction, parameter) {
    if (this.#mode(instruction, parameter) === 1) {
      return this.read(this.#pointer + parameter);
    }
    return this.read(this.#position(instruction, parameter));
  }

  /** Outputs belong to this run only. Execution pauses without consuming missing input. */
  run({ maxSteps = 100_000 } = {}) {
    integer(maxSteps, 'Step limit');
    if (maxSteps <= 0) throw new RangeError('Step limit must be positive');
    const outputs = [];
    let steps = 0;
    while (!this.#halted) {
      if (steps >= maxSteps) throw new Error(`Execution exceeded ${maxSteps} steps`);
      const instruction = this.read(this.#pointer);
      if (instruction < 0) throw new Error(`Invalid instruction ${instruction}`);
      const opcode = instruction % 100;
      const value = parameter => this.#value(instruction, parameter);
      const destination = parameter => this.#position(instruction, parameter);
      switch (opcode) {
        case 1:
        case 2:
        case 7:
        case 8: {
          const a = value(1);
          const b = value(2);
          const result = opcode === 1 ? a + b : opcode === 2 ? a * b
            : opcode === 7 ? Number(a < b) : Number(a === b);
          this.#write(destination(3), result);
          this.#pointer += 4;
          break;
        }
        case 3: {
          const location = destination(1);
          if (this.#inputs.length === 0) return { status: 'waiting', outputs, steps };
          this.#write(location, this.#inputs.shift());
          this.#pointer += 2;
          break;
        }
        case 4:
          outputs.push(value(1));
          this.#pointer += 2;
          break;
        case 5:
        case 6: {
          const condition = value(1);
          const target = value(2);
          const jump = opcode === 5 ? condition !== 0 : condition === 0;
          this.#pointer = jump ? address(target) : address(this.#pointer + 3);
          break;
        }
        case 9:
          this.#relativeBase = integer(this.#relativeBase + value(1), 'Relative base');
          this.#pointer += 2;
          break;
        case 99:
          this.#halted = true;
          break;
        default:
          throw new Error(`Unknown opcode ${opcode} at ${this.#pointer}`);
      }
      steps++;
    }
    return { status: 'halted', outputs, steps };
  }
}

export function parseProgram(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Program is empty');
  return text.trim().split(',').map(part => {
    if (!/^[+-]?\d+$/.test(part.trim())) throw new Error('Expected comma-separated integers');
    return integer(Number(part.trim()), 'Program value');
  });
}
