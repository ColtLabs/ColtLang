import { compile } from '@coltanedb/compiler';
import type { CommandContext } from '../context.ts';
import { ExitCode, type ExitCodeValue } from '../exit-code.ts';

/** Lexes, parses, and compiles a source unit, reporting every diagnostic it produces. */
export async function runCheck(context: CommandContext): Promise<ExitCodeValue> {
  const source = await context.readSource();
  const result = compile(source.text);

  if (result.diagnostics.length > 0) {
    context.reportDiagnostics(result.diagnostics, source.name);
    return ExitCode.Diagnostics;
  }

  if (context.options.json) {
    context.stdout.write(`${JSON.stringify({ source: source.name, diagnostics: [], steps: result.plan?.steps.length ?? 0 }, null, 2)}\n`);
    return ExitCode.Success;
  }
  if (!context.options.quiet) {
    context.stdout.write(`${source.name}: ok (${result.plan?.steps.length ?? 0} planned steps)\n`);
  }
  return ExitCode.Success;
}
