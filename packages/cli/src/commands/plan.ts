import { compile } from '@coltanedb/compiler';
import type { CommandContext } from '../context.ts';
import { ExitCode, type ExitCodeValue } from '../exit-code.ts';

/** Compiles a source unit and prints the backend-neutral execution plan. */
export async function runPlan(context: CommandContext): Promise<ExitCodeValue> {
  const source = await context.readSource();
  const result = compile(source.text);

  if (result.diagnostics.length > 0) {
    context.reportDiagnostics(result.diagnostics, source.name);
    return ExitCode.Diagnostics;
  }
  if (!result.plan) {
    context.stderr.write('Compilation produced no execution plan.\n');
    return ExitCode.Diagnostics;
  }

  context.stdout.write(`${JSON.stringify({ source: source.name, plan: result.plan }, null, 2)}\n`);
  return ExitCode.Success;
}
