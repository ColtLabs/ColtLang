import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile, postgresCapabilities } from '../packages/compiler/src/index.js';
import { parse } from '../packages/parser/src/index.js';

const coltBin = resolve(__dirname, '../target/debug/colt.exe');
const libraryPath = resolve(__dirname, '../examples/library.colt');
const librarySource = readFileSync(libraryPath, 'utf8');

function runColt(args: string[], input?: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(coltBin, args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      status: error.status ?? 1,
    };
  }
}

describe('Rust native toolchain differential parity', () => {
  it('reports version matching Colt 0.2.0', () => {
    const res = runColt(['version']);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('colt 0.2.0');
  });

  it('matches TypeScript postgres capability matrix', () => {
    const res = runColt(['capabilities', '--json']);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.backend).toBe('postgres');
    expect(parsed.capabilities).toEqual(postgresCapabilities);
  });

  it('verifies examples/library.colt check parity', () => {
    const tsResult = compile(librarySource);
    expect(tsResult.diagnostics).toEqual([]);

    const res = runColt(['check', libraryPath]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('ok (6 planned steps)');
  });

  it('verifies examples/library.colt plan parity', () => {
    const tsResult = compile(librarySource);
    expect(tsResult.plan).toBeDefined();

    const res = runColt(['plan', libraryPath]);
    expect(res.status).toBe(0);
    const rustPlan = JSON.parse(res.stdout).plan;

    expect(rustPlan.steps).toHaveLength(tsResult.plan!.steps.length);
    for (let i = 0; i < rustPlan.steps.length; i++) {
      expect(rustPlan.steps[i].backend).toBe(tsResult.plan!.steps[i].backend);
      expect(rustPlan.steps[i].operation).toBe(tsResult.plan!.steps[i].operation);
      expect(rustPlan.steps[i].collection).toBe(tsResult.plan!.steps[i].collection);
    }
  });

  it('verifies examples/library.colt parse parity', () => {
    const tsParsed = parse(librarySource);
    expect(tsParsed.diagnostics).toEqual([]);

    const res = runColt(['parse', libraryPath]);
    expect(res.status).toBe(0);
    const rustProgram = JSON.parse(res.stdout);

    expect(rustProgram.type).toBe('Program');
    expect(rustProgram.version).toBe('0.2');
    expect(rustProgram.statements).toHaveLength(tsParsed.program.statements.length);
  });

  it('reports diagnostics parity and exit code 1 on compile error', () => {
    const badSource = 'DEFINE COLLECTION a { id: uuid @key }\nDEFINE COLLECTION a { id: uuid @key }';
    const res = runColt(['check', '--stdin'], badSource);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('COLT2006');
  });

  it('reports diagnostics parity and exit code 1 on unknown collection', () => {
    const badSource = 'FIND nonexistent SELECT id';
    const res = runColt(['check', '--stdin'], badSource);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('COLT2002');
  });

  it('reports diagnostics parity and exit code 1 on empty atomic block', () => {
    const badSource = 'ATOMIC {}';
    const res = runColt(['check', '--stdin'], badSource);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('COLT2020');
  });
});
