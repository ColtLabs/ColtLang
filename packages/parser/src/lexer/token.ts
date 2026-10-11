export type TokenKind =
  | 'keyword'
  | 'identifier'
  | 'uuid'
  | 'integer'
  | 'float'
  | 'duration'
  | 'time'
  | 'string'
  | 'parameter'
  | 'operator'
  | 'punctuation'
  | 'pragma'
  | 'eof';

export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

export interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

export interface ColtToken {
  kind: TokenKind;
  lexeme: string;
  value: string;
  span: SourceSpan;
}

export interface ColtDiagnostic {
  code: string;
  message: string;
  span: SourceSpan;
}

export interface LexResult {
  tokens: ColtToken[];
  diagnostics: ColtDiagnostic[];
}