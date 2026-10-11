import type {
  ColtDiagnostic,
  ColtToken,
  LexResult,
  SourcePosition,
  TokenKind,
} from './token.ts';

const keywords = new Set([
  'DEFINE',
  'COLLECTION',
  'EDGE',
  'POLICY',
  'STRICT',
  'FLEXIBLE',
  'FIND',
  'SELECT',
  'FETCH',
  'WHERE',
  'ORDER',
  'BY',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
  'SINCE',
  'WINDOW',
  'LIVE',
  'NEAREST',
  'TO',
  'PUT',
  'CREATE',
  'SET',
  'GET',
  'DELETE',
  'RELATE',
  'ATOMIC',
  'FOR',
  'READ',
  'UPDATE',
  'WHEN',
  'IN',
  'AND',
  'OR',
  'NOT',
  'TRUE',
  'FALSE',
  'NULL',
  'UUID',
  'TEXT',
  'INT',
  'FLOAT',
  'BOOL',
  'TIME',
  'DURATION',
  'DOC',
  'LIST',
  'LINK',
  'VECTOR',
  'KEY',
  'UNIQUE',
  'CONNECT',
  'AS',
  'DEFAULT',
  'CONNECTION',
  'ENV',
  'MELD',
  'SYNC',
  'CONSTRAINT',
  'REFERENCES',
  'MODE',
  'POSTGRES',
  'SQLITE',
  'LIBSQL',
  'D1',
  'INDEX',
  'TTL',
  'STORAGE',
  'TIMESERIES',
  'BACKEND',
  'READONLY',
  'MONGODB',
  'FIRESTORE',
  'REDIS',
  'KV',
  'RELATIONAL',
  'DOCUMENT',
  'NOW',
]);

const twoCharacterOperators = new Set(['==', '!=', '<=', '>=', '->']);
const oneCharacterOperators = new Set(['<', '>', '+', '-', '*', '/', '%']);
const punctuation = new Set(['@', '{', '}', '(', ')', '[', ']', ',', ':', '.', '?', ';']);
const timePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const durationPattern = /^\d+[smhd](?![A-Za-z0-9_])/i;
const numberPattern = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*/;

class Lexer {
  private offset = 0;
  private line = 1;
  private column = 1;
  private readonly tokens: ColtToken[] = [];
  private readonly diagnostics: ColtDiagnostic[] = [];

  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  run(): LexResult {
    while (!this.atEnd()) {
      const char = this.peek();

      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        this.advance();
      } else if (this.startsWith('--')) {
        this.skipLineComment();
      } else if (this.startsWith('/*')) {
        this.skipBlockComment();
      } else if (this.startsWith('#!')) {
        this.skipLineComment();
      } else if (this.startsWith('#colt')) {
        this.readPragma();
      } else if (char === '"') {
        this.readString();
      } else if (char === '$') {
        this.readParameter();
      } else if (this.isDigit(char)) {
        this.readNumberOrTime();
      } else if (this.isIdentifierStart(char)) {
        this.readIdentifier();
      } else if (this.readOperatorOrPunctuation()) {
        continue;
      } else {
        const start = this.position();
        this.advance();
        this.report('COLT1001', `Unexpected character ${JSON.stringify(char)}.`, start);
      }
    }

    const end = this.position();
    this.tokens.push({
      kind: 'eof',
      lexeme: '',
      value: '',
      span: { start: end, end },
    });

    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private readIdentifier(): void {
    const start = this.position();
    const lexeme = this.match(identifierPattern);
    const normalized = lexeme.toUpperCase();
    const kind: TokenKind = keywords.has(normalized) ? 'keyword' : 'identifier';
    this.addToken(kind, lexeme, kind === 'keyword' ? normalized : lexeme, start);
  }

  private readParameter(): void {
    const start = this.position();
    this.advance();
    const name = this.match(identifierPattern);
    if (name.length === 0) {
      this.report('COLT1002', 'Expected a parameter name after $.', start);
      return;
    }
    this.addToken('parameter', this.source.slice(start.offset, this.offset), name, start);
  }

  private readNumberOrTime(): void {
    const start = this.position();
    const remaining = this.source.slice(this.offset);
    const uuid = remaining.match(uuidPattern)?.[0];
    if (uuid && !/[A-Za-z0-9_]/.test(remaining[uuid.length] ?? '')) {
      this.advanceText(uuid);
      this.addToken('uuid', uuid, uuid, start);
      return;
    }
    const time = remaining.match(timePattern)?.[0];
    if (time && !Number.isNaN(Date.parse(time))) {
      this.advanceText(time);
      this.addToken('time', time, time, start);
      return;
    }

    const duration = remaining.match(durationPattern)?.[0];
    if (duration) {
      this.advanceText(duration);
      this.addToken('duration', duration, duration, start);
      return;
    }

    const number = remaining.match(numberPattern)?.[0];
    if (!number) {
      this.advance();
      this.report('COLT1003', 'Malformed numeric literal.', start);
      return;
    }

    this.advanceText(number);
    this.addToken(number.includes('.') || /[eE]/.test(number) ? 'float' : 'integer', number, number, start);
  }

  private readString(): void {
    const start = this.position();
    this.advance();
    let value = '';

    while (!this.atEnd() && this.peek() !== '"' && this.peek() !== '\n') {
      const char = this.advance();
      if (char !== '\\') {
        value += char;
        continue;
      }

      if (this.atEnd()) break;
      const escape = this.advance();
      const replacements: Record<string, string> = {
        '"': '"',
        '\\': '\\',
        n: '\n',
        r: '\r',
        t: '\t',
      };

      if (escape === 'u') {
        const digits = this.source.slice(this.offset, this.offset + 4);
        if (/^[0-9A-Fa-f]{4}$/.test(digits)) {
          this.advanceText(digits);
          value += String.fromCharCode(Number.parseInt(digits, 16));
        } else {
          this.report('COLT1004', 'Expected four hexadecimal digits after \\u.', start);
        }
      } else if (Object.hasOwn(replacements, escape)) {
        value += replacements[escape];
      } else {
        this.report('COLT1004', `Unknown string escape \\${escape}.`, start);
        value += escape;
      }
    }

    if (this.peek() !== '"') {
      this.report('COLT1005', 'Unterminated string literal.', start);
      return;
    }

    this.advance();
    const lexeme = this.source.slice(start.offset, this.offset);
    this.addToken('string', lexeme, value, start);
  }

  private skipLineComment(): void {
    while (!this.atEnd() && this.peek() !== '\n') this.advance();
  }

  private skipBlockComment(): void {
    const start = this.position();
    this.advanceText('/*');
    while (!this.atEnd() && !this.startsWith('*/')) this.advance();
    if (this.atEnd()) {
      this.report('COLT1006', 'Unterminated block comment.', start);
      return;
    }
    this.advanceText('*/');
  }

  private readPragma(): void {
    const start = this.position();
    this.advanceText('#colt');
    while (!this.atEnd() && (this.peek() === ' ' || this.peek() === '\t')) {
      this.advance();
    }
    const versionMatch = this.source.slice(this.offset).match(/^\d+(?:\.\d+)?/);
    let version = '0.2';
    if (versionMatch) {
      version = versionMatch[0];
      this.advanceText(version);
    }
    while (!this.atEnd() && this.peek() !== '\n') {
      this.advance();
    }
    this.tokens.push({
      kind: 'pragma',
      lexeme: `#colt ${version}`,
      value: version,
      span: { start, end: this.position() },
    });
  }

  private readOperatorOrPunctuation(): boolean {
    const start = this.position();
    const pair = this.source.slice(this.offset, this.offset + 2);
    if (twoCharacterOperators.has(pair)) {
      this.advanceText(pair);
      this.addToken('operator', pair, pair, start);
      return true;
    }

    const char = this.peek();
    if (oneCharacterOperators.has(char)) {
      this.advance();
      this.addToken('operator', char, char, start);
      return true;
    }
    if (punctuation.has(char)) {
      this.advance();
      this.addToken('punctuation', char, char, start);
      return true;
    }
    return false;
  }

  private addToken(kind: TokenKind, lexeme: string, value: string, start: SourcePosition): void {
    this.tokens.push({ kind, lexeme, value, span: { start, end: this.position() } });
  }

  private report(code: string, message: string, start: SourcePosition): void {
    this.diagnostics.push({ code, message, span: { start, end: this.position() } });
  }

  private match(pattern: RegExp): string {
    const matched = this.source.slice(this.offset).match(pattern)?.[0] ?? '';
    this.advanceText(matched);
    return matched;
  }

  private advanceText(text: string): void {
    for (let index = 0; index < text.length; index += 1) this.advance();
  }

  private advance(): string {
    const char = this.source[this.offset++] ?? '';
    if (char === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return char;
  }

  private position(): SourcePosition {
    return { offset: this.offset, line: this.line, column: this.column };
  }

  private peek(): string {
    return this.source[this.offset] ?? '';
  }

  private startsWith(text: string): boolean {
    return this.source.startsWith(text, this.offset);
  }

  private atEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isIdentifierStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }
}

export function lex(source: string): LexResult {
  return new Lexer(source).run();
}
