import { parse } from '@coltanedb/parser';
import type { CommandContext } from '../context.ts';
import { ExitCode, type ExitCodeValue } from '../exit-code.ts';

/** Parses a source unit and prints the resulting AST. */
export async function runParse(context: CommandContext): Promise<ExitCodeValue> {
  const source = await context.readSource();
  const result = parse(source.text);

  if (context.options.json) {
    context.stdout.write(`${JSON.stringify({ source: source.name, program: result.program, diagnostics: result.diagnostics }, null, 2)}\n`);
  } else {
    context.stdout.write(`${JSON.stringify(result.program, null, 2)}\n`);
  }

  if (result.diagnostics.length > 0) {
    context.reportDiagnostics(result.diagnostics, source.name);
    return ExitCode.Diagnostics;
  }
  return ExitCode.Success;
}
