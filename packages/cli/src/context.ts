import type { CliOptions } from './args.ts';
import {
  formatDiagnostics,
  formatDiagnosticsAsJson,
  summarizeDiagnostics,
  type ReportedDiagnostic,
} from './diagnostics.ts';
import { readSource, type SourceInput } from './source.ts';

export interface OutputTarget {
  write(text: string): void;
}

export interface CommandContext {
  readonly options: CliOptions;
  readonly stdout: OutputTarget;
  readonly stderr: OutputTarget;
  readSource(): Promise<SourceInput>;
  reportDiagnostics(diagnostics: readonly ReportedDiagnostic[], sourceName: string): void;
}

export interface ContextStreams {
  readonly stdout: OutputTarget;
  readonly stderr: OutputTarget;
}

export const processStreams: ContextStreams = {
  stdout: { write: (text) => void process.stdout.write(text) },
  stderr: { write: (text) => void process.stderr.write(text) },
};

export function createContext(options: CliOptions, streams: ContextStreams = processStreams): CommandContext {
  return {
    options,
    stdout: streams.stdout,
    stderr: streams.stderr,
    readSource: () => readSource(options.file, options.stdin),
    reportDiagnostics(diagnostics, sourceName) {
      if (options.json) {
        streams.stdout.write(formatDiagnosticsAsJson(diagnostics, sourceName));
        return;
      }
      if (diagnostics.length === 0) return;
      streams.stderr.write(formatDiagnostics(diagnostics, sourceName));
      streams.stderr.write(`${summarizeDiagnostics(diagnostics)}\n`);
    },
  };
}
