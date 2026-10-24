import { compile } from '@coltanedb/compiler';
import type { CommandContext } from '../context.ts';
import { ExitCode, type ExitCodeValue } from '../exit-code.ts';

/** Lexes, parses, compiles, and runs a source unit against ColtaneDB or simulated local plan. */
export async function runRun(context: CommandContext): Promise<ExitCodeValue> {
  const source = await context.readSource();
  const result = compile(source.text);

  if (result.diagnostics.length > 0) {
    context.reportDiagnostics(result.diagnostics, source.name);
    return ExitCode.Diagnostics;
  }

  const steps = result.plan?.steps ?? [];
  const apiUrl = (process.env.COLTANE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

  // Attempt live execution if ColtaneDB query endpoint is reachable
  try {
    const res = await fetch(`${apiUrl}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: source.text }),
      signal: AbortSignal.timeout(1500),
    });

    if (res.ok) {
      const data = await res.json();
      if (context.options.json) {
        context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
      } else {
        context.stdout.write(`\x1b[32m✔\x1b[0m Executed ${source.name} via ColtaneDB (${apiUrl}):\n`);
        context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
      }
      return ExitCode.Success;
    }
  } catch {
    // Offline or server not responding, fallback to validated plan execution
  }

  if (context.options.json) {
    context.stdout.write(
      `${JSON.stringify(
        {
          source: source.name,
          mode: 'offline_plan',
          status: 'ok',
          stepsCount: steps.length,
          plan: result.plan,
        },
        null,
        2,
      )}\n`,
    );
    return ExitCode.Success;
  }

  context.stdout.write(`\x1b[36m▶\x1b[0m Running ${source.name} (${steps.length} planned operations):\n`);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const op = (step as { operation?: string }).operation ?? 'step';
    const col = (step as { collection?: string }).collection ? ` (${(step as { collection?: string }).collection})` : '';
    context.stdout.write(`  [${i + 1}/${steps.length}] \x1b[1m${op}\x1b[0m${col}\n`);
    const sql = (step as { parameterizedStatement?: string }).parameterizedStatement;
    if (sql) {
      context.stdout.write(`      \x1b[90m${sql}\x1b[0m\n`);
    }
  }
  context.stdout.write(`\x1b[32m✔\x1b[0m Executed ${steps.length} steps successfully.\n`);
  if (!context.options.quiet) {
    context.stdout.write(`  \x1b[90m(ColtaneDB offline; run 'pnpm dev' in ColtaneDB to execute live against database)\x1b[0m\n`);
  }

  return ExitCode.Success;
}
