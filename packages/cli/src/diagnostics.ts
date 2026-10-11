import type { SourceSpan } from '@coltanedb/parser';

/**
 * The shape every Colt diagnostic shares. Parser and compiler diagnostics are both
 * assignable to this interface, so the CLI can render either without depending on
 * a specific producer.
 */
export interface ReportedDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly hint?: string;
  readonly span: SourceSpan;
}

export function formatDiagnostic(diagnostic: ReportedDiagnostic, sourceName: string): string {
  const { line, column } = diagnostic.span.start;
  const header = `${sourceName}:${line}:${column}: error [${diagnostic.code}] ${diagnostic.message}`;
  return diagnostic.hint ? `${header}\n  hint: ${diagnostic.hint}` : header;
}

export function formatDiagnostics(diagnostics: readonly ReportedDiagnostic[], sourceName: string): string {
  return `${diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, sourceName)).join('\n')}\n`;
}

export function formatDiagnosticsAsJson(diagnostics: readonly ReportedDiagnostic[], sourceName: string): string {
  return `${JSON.stringify({ source: sourceName, diagnostics }, null, 2)}\n`;
}

export function summarizeDiagnostics(diagnostics: readonly ReportedDiagnostic[]): string {
  const count = diagnostics.length;
  return `${count} ${count === 1 ? 'error' : 'errors'}`;
}
