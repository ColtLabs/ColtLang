import { postgresCapabilities } from '@coltanedb/compiler';
import type { CommandContext } from '../context.ts';
import { ExitCode, type ExitCodeValue } from '../exit-code.ts';

/** Prints the Postgres Tier-1 capability matrix used by the planner. */
export async function runCapabilities(context: CommandContext): Promise<ExitCodeValue> {
  if (context.options.json) {
    context.stdout.write(`${JSON.stringify({ backend: 'postgres', capabilities: postgresCapabilities }, null, 2)}\n`);
    return ExitCode.Success;
  }

  const width = Math.max(...Object.keys(postgresCapabilities).map((name) => name.length));
  for (const [name, supported] of Object.entries(postgresCapabilities)) {
    context.stdout.write(`${name.padEnd(width)}  ${supported ? 'yes' : 'no'}\n`);
  }
  return ExitCode.Success;
}
