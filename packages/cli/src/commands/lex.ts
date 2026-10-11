import { lex, type ColtToken } from '@coltanedb/parser';
import type { CommandContext } from '../context.ts';
import { ExitCode, type ExitCodeValue } from '../exit-code.ts';

const kindWidth = 12;

/** Lexes a source unit and prints the token stream. */
export async function runLex(context: CommandContext): Promise<ExitCodeValue> {
  const source = await context.readSource();
  const result = lex(source.text);
  const tokens = result.tokens.filter((token) => token.kind !== 'eof');

  if (context.options.json) {
    context.stdout.write(`${JSON.stringify({ source: source.name, tokens, diagnostics: result.diagnostics }, null, 2)}\n`);
  } else {
    for (const token of tokens) context.stdout.write(`${formatToken(token)}\n`);
  }

  if (result.diagnostics.length > 0) {
    context.reportDiagnostics(result.diagnostics, source.name);
    return ExitCode.Diagnostics;
  }
  return ExitCode.Success;
}

function formatToken(token: ColtToken): string {
  const { line, column } = token.span.start;
  const position = `${line}:${column}`;
  return `${token.kind.padEnd(kindWidth)} ${JSON.stringify(token.value).padEnd(24)} ${position}`;
}
