import { describe, expect, it } from 'vitest';
import { compile } from '../packages/compiler/src/index.js';
import { lex, parse } from '../packages/parser/src/index.js';

/**
 * Parser robustness harness (M1 acceptance: "parser fuzzing has no unhandled exceptions").
 * Every corpus below is generated from a fixed seed, so any failure is reproducible.
 */

const diagnosticPattern = /^COLT\d{4}$/;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const vocabulary = [
  'DEFINE', 'COLLECTION', 'STRICT', 'FLEXIBLE', 'FIND', 'SELECT', 'FETCH', 'WHERE', 'ORDER', 'BY',
  'ASC', 'DESC', 'LIMIT', 'OFFSET', 'SINCE', 'WINDOW', 'LIVE', 'NEAREST', 'PUT', 'CREATE', 'SET',
  'GET', 'DELETE', 'RELATE', 'ATOMIC', 'AND', 'OR', 'NOT', 'IN', 'TRUE', 'FALSE', 'NULL',
  'uuid', 'text', 'int', 'float', 'bool', 'time', 'duration', 'doc', 'list', 'link', 'vector',
  'users', 'orders', 'id', 'name', 'email', 'profile', 'now', '$email', '$owner',
  '"text"', '"unterminated', '42', '3.5', '1.5e3', '30m', '2026-09-30T12:30:00Z',
  '11111111-1111-4111-8111-111111111111',
  '{', '}', '(', ')', '[', ']', ',', ':', '.', '?', ';', '@', '->', '==', '!=', '<=', '>=', '<', '>',
  '+', '-', '*', '/', '%', '--', '/*', '*/', '\\', '\n', '\t', ' ', '',
];

const validProgram = `DEFINE COLLECTION users STRICT @backend(neon) {
  id: uuid @key,
  email: text @unique,
  nickname: text?,
  created: time @default(now),
  profile: doc
}
FIND users SELECT email, profile.city WHERE email == $email ORDER BY created DESC LIMIT 10 OFFSET 0
PUT users:11111111-1111-4111-8111-111111111111 { email: "a@x.com", profile: {} }
CREATE users { email: "b@x.com", profile: { city: "Berlin" } }
DELETE users WHERE email == $email
ATOMIC { DELETE users:11111111-1111-4111-8111-111111111111 }
`;

function randomTokenSoup(random: () => number, length: number): string {
  const parts: string[] = [];
  for (let index = 0; index < length; index += 1) {
    parts.push(vocabulary[Math.floor(random() * vocabulary.length)] ?? '');
    parts.push(random() < 0.5 ? ' ' : '\n');
  }
  return parts.join('');
}

const characterAlphabet = 'ABCXYZabcxyz019 \t\n{}()[]<>,.:;?@$+-*/%="\'\\!#&|~^_`\u00e9\u20ac\u0000';

function randomCharacterSoup(random: () => number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += characterAlphabet[Math.floor(random() * characterAlphabet.length)] ?? 'a';
  }
  return text;
}

function mutate(random: () => number, source: string, edits: number): string {
  let result = source;
  for (let index = 0; index < edits; index += 1) {
    const position = Math.floor(random() * (result.length + 1));
    const operation = Math.floor(random() * 4);
    const character = characterAlphabet[Math.floor(random() * characterAlphabet.length)] ?? 'a';
    if (operation === 0) {
      result = `${result.slice(0, position)}${character}${result.slice(position)}`;
    } else if (operation === 1 && result.length > 0) {
      result = `${result.slice(0, position)}${result.slice(position + 1)}`;
    } else if (operation === 2 && result.length > 0) {
      result = `${result.slice(0, position)}${character}${result.slice(position + 1)}`;
    } else {
      const end = Math.min(result.length, position + Math.floor(random() * 8));
      result = `${result.slice(0, position)}${result.slice(position, end)}${result.slice(position)}`;
    }
  }
  return result;
}

/** Asserts that every stage stays total: no throws, and every diagnostic is well formed. */
function assertTotal(source: string): void {
  const lexed = lex(source);
  expect(lexed.tokens.at(-1)?.kind).toBe('eof');
  for (const diagnostic of lexed.diagnostics) {
    expect(diagnostic.code).toMatch(diagnosticPattern);
    expect(diagnostic.span.start.offset).toBeGreaterThanOrEqual(0);
    expect(diagnostic.span.end.offset).toBeLessThanOrEqual(source.length);
  }

  const parsed = parse(source);
  expect(parsed.program.type).toBe('Program');
  expect(Array.isArray(parsed.diagnostics)).toBe(true);
  for (const diagnostic of parsed.diagnostics) {
    expect(diagnostic.code).toMatch(diagnosticPattern);
    expect(typeof diagnostic.message).toBe('string');
    expect(diagnostic.span.start.offset).toBeGreaterThanOrEqual(0);
    expect(diagnostic.span.end.offset).toBeLessThanOrEqual(source.length);
  }

  const compiled = compile(source);
  expect(Array.isArray(compiled.diagnostics)).toBe(true);
  if (compiled.plan) expect(compiled.plan.steps.length).toBeGreaterThan(0);
}

describe('Colt parser fuzzing', () => {
  it('compiles the baseline program used for mutation and truncation', () => {
    const result = compile(validProgram);
    expect(result.diagnostics).toEqual([]);
    expect(result.plan).toBeDefined();
  });

  it('never throws on random token soup', () => {
    const random = createRandom(0x5eed0001);
    for (let iteration = 0; iteration < 60; iteration += 1) {
      assertTotal(randomTokenSoup(random, 4 + Math.floor(random() * 40)));
    }
  });

  it('never throws on random character soup', () => {
    const random = createRandom(0x5eed0002);
    for (let iteration = 0; iteration < 60; iteration += 1) {
      assertTotal(randomCharacterSoup(random, 1 + Math.floor(random() * 160)));
    }
  });

  it('never throws on random mutations of a valid program', () => {
    const random = createRandom(0x5eed0003);
    for (let iteration = 0; iteration < 60; iteration += 1) {
      assertTotal(mutate(random, validProgram, 1 + Math.floor(random() * 12)));
    }
  });

  it('never throws on every prefix of a valid program', () => {
    for (let length = 0; length <= validProgram.length; length += 1) {
      assertTotal(validProgram.slice(0, length));
    }
  });

  it('never throws on every single-character deletion of a valid program', () => {
    for (let index = 0; index < validProgram.length; index += 1) {
      assertTotal(`${validProgram.slice(0, index)}${validProgram.slice(index + 1)}`);
    }
  });

  it('is deterministic: identical sources always produce identical diagnostics', () => {
    const random = createRandom(0x5eed0004);
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const source = randomTokenSoup(random, 20);
      const first = parse(source).diagnostics.map(({ code, message }) => `${code}:${message}`);
      const second = parse(source).diagnostics.map(({ code, message }) => `${code}:${message}`);
      expect(second).toEqual(first);
    }
  });
});
