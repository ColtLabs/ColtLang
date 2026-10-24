#!/usr/bin/env node
import { parseArgs, type CliOptions } from './args.ts';
import { runCapabilities } from './commands/capabilities.ts';
import { runCheck } from './commands/check.ts';
import { runLex } from './commands/lex.ts';
import { runParse } from './commands/parse.ts';
import { runPlan } from './commands/plan.ts';
import { runRun } from './commands/run.ts';
import { createContext, processStreams, type CommandContext } from './context.ts';
import { ExitCode, type ExitCodeValue } from './exit-code.ts';
import { SourceReadError } from './source.ts';
import { helpText, versionText } from './usage.ts';
import { UsageError } from './usage-error.ts';

type CommandRunner = (context: CommandContext) => Promise<ExitCodeValue>;

const runners: Readonly<Record<string, CommandRunner>> = {
  check: runCheck,
  plan: runPlan,
  run: runRun,
  lex: runLex,
  parse: runParse,
  capabilities: runCapabilities,
};

async function main(argv: readonly string[]): Promise<ExitCodeValue> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      processStreams.stderr.write(`${error.message}\n\n${helpText()}`);
      return ExitCode.UsageError;
    }
    throw error;
  }

  if (options.command === 'help') {
    processStreams.stdout.write(helpText());
    return ExitCode.Success;
  }
  if (options.command === 'version') {
    processStreams.stdout.write(versionText());
    return ExitCode.Success;
  }

  const runner = runners[options.command];
  if (!runner) {
    processStreams.stderr.write(`Unsupported command ${options.command}.\n`);
    return ExitCode.UsageError;
  }

  try {
    return await runner(createContext(options));
  } catch (error) {
    if (error instanceof SourceReadError) {
      processStreams.stderr.write(`${error.message}\n`);
      return ExitCode.UsageError;
    }
    throw error;
  }
}

process.exitCode = await main(process.argv.slice(2));
