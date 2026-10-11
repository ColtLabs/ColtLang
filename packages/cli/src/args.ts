import { UsageError } from './usage-error.ts';

export const CommandNames = ['check', 'plan', 'lex', 'parse', 'capabilities', 'help', 'version'] as const;

export type CommandName = (typeof CommandNames)[number];

/** Commands that consume `.colt` source, either from a file or from standard input. */
const sourceCommands: ReadonlySet<CommandName> = new Set(['check', 'plan', 'lex', 'parse']);

export interface CliOptions {
  readonly command: CommandName;
  readonly file: string | undefined;
  readonly json: boolean;
  readonly stdin: boolean;
  readonly quiet: boolean;
}

interface MutableCliOptions {
  command: CommandName | undefined;
  file: string | undefined;
  json: boolean;
  stdin: boolean;
  quiet: boolean;
}

const standardInputFlag = '-';

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: MutableCliOptions = {
    command: undefined,
    file: undefined,
    json: false,
    stdin: false,
    quiet: false,
  };

  for (const argument of argv) {
    switch (argument) {
      case '--json':
        options.json = true;
        break;
      case '--stdin':
        options.stdin = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        options.command = 'help';
        break;
      case '--version':
      case '-V':
        options.command = 'version';
        break;
      default:
        acceptPositional(options, argument);
        break;
    }
  }

  return finalize(options);
}

function acceptPositional(options: MutableCliOptions, argument: string): void {
  if (argument.startsWith('-') && argument !== standardInputFlag) {
    throw new UsageError(`Unknown option ${argument}.`);
  }
  if (argument === standardInputFlag) {
    options.stdin = true;
    return;
  }
  if (options.command === undefined && isCommandName(argument)) {
    options.command = argument;
    return;
  }
  if (options.file === undefined && options.command !== 'help' && options.command !== 'version') {
    options.file = argument;
    return;
  }
  throw new UsageError(`Unexpected argument ${argument}.`);
}

function finalize(options: MutableCliOptions): CliOptions {
  if (options.command === 'help' || options.command === 'version') {
    return { ...options, command: options.command, file: undefined };
  }

  const command = options.command ?? (options.file === undefined && !options.stdin ? 'help' : 'check');
  if (sourceCommands.has(command) && options.file === undefined && !options.stdin) {
    throw new UsageError(`The ${command} command needs a .colt file, or --stdin to read standard input.`);
  }
  if (!sourceCommands.has(command) && options.file !== undefined) {
    throw new UsageError(`The ${command} command does not take a source file.`);
  }
  return { ...options, command, file: options.file };
}

export function isCommandName(value: string): value is CommandName {
  return (CommandNames as readonly string[]).includes(value);
}
