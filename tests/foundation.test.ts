import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('workspace foundation', () => {
  it('pins the approved runtime and package manager', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      name: string;
      packageManager: string;
      engines: { node: string };
    };

    expect(packageJson.name).toBe('@coltlabs/coltlang');
    expect(packageJson.packageManager).toBe('pnpm@10.34.6');
    expect(packageJson.engines.node).toBe('24.x');
  });
});