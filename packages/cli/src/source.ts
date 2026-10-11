import { readFile } from 'node:fs/promises';

export interface SourceInput {
  readonly name: string;
  readonly text: string;
}

/** Raised when the requested `.colt` file cannot be read from disk. */
export class SourceReadError extends Error {
  readonly target: string;

  constructor(target: string, cause?: unknown) {
    super(`Cannot read ${target}.`);
    this.name = 'SourceReadError';
    this.target = target;
    if (cause !== undefined) this.cause = cause;
  }
}

export const StandardInputName = '<stdin>';

export async function readSource(file: string | undefined, useStandardInput: boolean): Promise<SourceInput> {
  if (useStandardInput || file === undefined) {
    return { name: StandardInputName, text: await readStandardInput() };
  }
  try {
    return { name: file, text: await readFile(file, 'utf8') };
  } catch (error) {
    throw new SourceReadError(file, error);
  }
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks).toString('utf8');
}
