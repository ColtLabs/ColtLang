import { readFileSync } from 'node:fs';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
}

let cachedManifest: PackageManifest | undefined;

function readManifest(): PackageManifest {
  if (cachedManifest) return cachedManifest;
  const url = new URL('../package.json', import.meta.url);
  cachedManifest = JSON.parse(readFileSync(url, 'utf8')) as PackageManifest;
  return cachedManifest;
}

export function versionText(): string {
  const manifest = readManifest();
  return `colt ${manifest.version} (${manifest.name})\n`;
}

export function helpText(): string {
  return [
    'colt — the ColtaneDB compiler command line interface.',
    '',
    'Usage:',
    '  colt <command> [file.colt] [options]',
    '',
    `  ${versionText().trim()}`,
    '',
    'Commands:',
    '  check <file>         Lex, parse, and compile; report diagnostics. Exit 1 on any error.',
    '  plan  <file>         Compile and print the backend-neutral execution plan as JSON.',
    '  parse <file>         Parse and print the AST as JSON.',
    '  lex   <file>         Lex and print the token stream.',
    '  capabilities         Print the Postgres Tier-1 capability matrix.',
    '  help                 Print this help.',
    '  version              Print the CLI version.',
    '',
    'Options:',
    '  --json               Emit machine-readable JSON instead of text.',
    '  --stdin, -           Read .colt source from standard input.',
    '  --quiet              Suppress success messages.',
    '  --help, -h           Print this help.',
    '  --version, -V        Print the CLI version.',
    '',
    'The compiler never connects to a provider, executes a plan, or embeds values in SQL.',
    '',
  ].join('\n');
}
