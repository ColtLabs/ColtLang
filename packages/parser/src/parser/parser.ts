import type {
  Annotation,
  AtomicStatement,
  ConnectStatement,
  CreateStatement,
  DefaultConnectionStatement,
  DefineCollectionStatement,
  DeleteStatement,
  Expression,
  FieldDefinition,
  FieldPath,
  FindStatement,
  ObjectField,
  Program,
  PutStatement,
  RecordId,
  Statement,
  TypeDefinition,
} from '../ast.ts';
import { lex } from '../lexer/lexer.ts';
import type { ColtDiagnostic, ColtToken, LexResult, SourceSpan } from '../lexer/token.ts';

const reservedStatements = new Set(['LIVE', 'SET', 'GET', 'RELATE', 'MELD']);
const reservedClauses = new Set(['FETCH', 'NEAREST', 'SINCE', 'WINDOW']);
const statementKeywords = new Set(['DEFINE', 'FIND', 'PUT', 'CREATE', 'DELETE', 'ATOMIC', 'CONNECT', 'DEFAULT']);
const precedence = new Map<string, number>([
  ['OR', 1],
  ['AND', 2],
  ['==', 3],
  ['!=', 3],
  ['<', 3],
  ['<=', 3],
  ['>', 3],
  ['>=', 3],
  ['IN', 3],
  ['+', 4],
  ['-', 4],
  ['*', 5],
  ['/', 5],
  ['%', 5],
]);

class ParseFailure extends Error {
  readonly diagnostic: ColtDiagnostic;

  constructor(diagnostic: ColtDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

class Parser {
  private current = 0;
  private readonly diagnostics: ColtDiagnostic[];
  private readonly tokens: ColtToken[];

  constructor(result: LexResult) {
    this.tokens = result.tokens;
    this.diagnostics = [...result.diagnostics];
  }

  run(): { program: Program; diagnostics: ColtDiagnostic[] } {
    const statements: Statement[] = [];
    const start = this.peek().span.start;
    let version: string | undefined;

    while (!this.check('eof')) {
      if (this.check('pragma')) {
        version = this.advance().value;
        continue;
      }
      const previous = this.current;
      try {
        statements.push(this.statement());
      } catch (error) {
        if (error instanceof ParseFailure) this.diagnostics.push(error.diagnostic);
        else {
          this.diagnostics.push({
            code: 'COLT1099',
            message: 'Parser recovered from an unexpected internal error.',
            span: this.peek().span,
          });
        }
        this.synchronize();
      }
      if (this.current === previous && !this.check('eof')) this.advance();
      this.matchValue(';');
    }

    const eof = this.peek();
    return {
      program: { type: 'Program', version, statements, span: { start, end: eof.span.end } },
      diagnostics: this.diagnostics,
    };
  }

  private statement(): Statement {
    if (this.checkValue('CONNECT')) return this.connectStatement();
    if (this.checkValue('DEFAULT')) return this.defaultConnectionStatement();
    if (this.checkValue('DEFINE')) {
      if (
        this.peekNext().value === 'MELD' ||
        this.peekNext().value === 'SYNC' ||
        this.peekNext().value === 'CONSTRAINT'
      ) {
        this.advance();
        this.reserved(this.peek());
      }
      return this.defineCollection();
    }
    if (this.checkValue('FIND')) return this.findStatement();
    if (this.checkValue('PUT')) return this.putStatement();
    if (this.checkValue('CREATE')) return this.createStatement();
    if (this.checkValue('DELETE')) return this.deleteStatement();
    if (this.checkValue('ATOMIC')) return this.atomicStatement();
    if (reservedStatements.has(this.peek().value)) this.reserved(this.peek());
    if (reservedClauses.has(this.peek().value)) this.reserved(this.peek());
    if (this.checkValue('EDGE') || this.checkValue('POLICY') || this.checkValue('MELD')) this.reserved(this.peek());
    throw this.failure('COLT1101', `Expected a statement, found ${this.describe(this.peek())}.`);
  }

  private connectStatement(): ConnectStatement {
    const start = this.consumeValue('CONNECT').span.start;
    const alias = this.consumeIdentifier('Expected connection alias after CONNECT.');
    this.consumeValue('AS', 'Expected AS after connection alias.');
    const engineToken = this.consumeName('Expected engine name after AS.');
    const engine = engineToken.value.toLowerCase();
    this.consumeValue('(', 'Expected ( after engine name.');
    if (this.check('string')) {
      const stringToken = this.advance();
      if (this.checkValue(')')) this.advance();
      throw this.failure('COLT2023', 'connection strings must use env("VAR"), not a literal URL', stringToken);
    }
    this.consumeValue('ENV', 'Expected env("VAR") for connection string.');
    this.consumeValue('(', 'Expected ( after env.');
    const envVar = this.consumeString('Expected environment variable name in env("...").');
    this.consumeValue(')', 'Expected ) after environment variable name.');
    const end = this.consumeValue(')', 'Expected ) after engine configuration.').span.end;
    return {
      type: 'Connect',
      alias,
      engine,
      envVar,
      span: { start, end },
    };
  }

  private defaultConnectionStatement(): DefaultConnectionStatement {
    const start = this.consumeValue('DEFAULT').span.start;
    this.consumeValue('CONNECTION', 'Expected CONNECTION after DEFAULT.');
    const alias = this.consumeIdentifier('Expected connection alias after DEFAULT CONNECTION.');
    const end = this.previous().span.end;
    return {
      type: 'DefaultConnection',
      alias,
      span: { start, end },
    };
  }

  private defineCollection(): DefineCollectionStatement {
    const start = this.consumeValue('DEFINE').span.start;
    if (
      this.matchValue('EDGE') ||
      this.matchValue('POLICY') ||
      this.matchValue('MELD') ||
      this.matchValue('SYNC') ||
      this.matchValue('CONSTRAINT')
    ) {
      this.reserved(this.previous());
    }
    this.consumeValue('COLLECTION', 'Expected COLLECTION after DEFINE.');
    const name = this.consumeIdentifier('Expected a collection name.');
    const mode = this.matchValue('FLEXIBLE') ? 'FLEXIBLE' : (this.matchValue('STRICT'), 'STRICT');
    const annotations = this.annotations();
    this.consumeValue('{', 'Expected { before collection fields.');
    const fields: FieldDefinition[] = [];

    while (!this.checkValue('}') && !this.check('eof')) {
      fields.push(this.fieldDefinition());
      if (!this.matchValue(',')) break;
    }

    const end = this.consumeValue('}', 'Expected } after collection fields.').span.end;
    return { type: 'DefineCollection', name, mode, annotations, fields, span: { start, end } };
  }

  private fieldDefinition(): FieldDefinition {
    const start = this.peek().span.start;
    const name = this.consumeIdentifier('Expected a field name.');
    this.consumeValue(':', 'Expected : after field name.');
    const valueType = this.typeDefinition();
    const optional = this.matchValue('?');
    const annotations = this.annotations();
    return {
      name,
      valueType,
      optional,
      annotations,
      span: { start, end: this.previous().span.end },
    };
  }

  private typeDefinition(): TypeDefinition {
    const token = this.peek();
    const name = token.value;
    if (['UUID', 'TEXT', 'INT', 'FLOAT', 'BOOL', 'TIME', 'DURATION', 'DOC'].includes(name)) {
      this.advance();
      return { kind: 'primitive', name: name.toLowerCase(), span: token.span };
    }
    if (name === 'LIST') {
      const start = this.advance().span.start;
      this.consumeValue('<', 'Expected < after LIST.');
      const itemType = this.typeDefinition();
      const end = this.consumeValue('>', 'Expected > after list item type.').span.end;
      return { kind: 'list', itemType, span: { start, end } };
    }
    if (name === 'LINK') {
      const start = this.advance().span.start;
      this.consumeValue('<', 'Expected < after LINK.');
      const collection = this.consumeIdentifier('Expected a collection name in LINK type.');
      const end = this.consumeValue('>', 'Expected > after linked collection.').span.end;
      return { kind: 'link', name: collection, span: { start, end } };
    }
    if (name === 'VECTOR') {
      const start = this.advance().span.start;
      this.consumeValue('(', 'Expected ( after VECTOR.');
      const dimension = this.consumeInteger('Expected vector dimension.');
      const end = this.consumeValue(')', 'Expected ) after vector dimension.').span.end;
      return { kind: 'vector', dimension: Number(dimension.value), span: { start, end } };
    }
    throw this.failure('COLT1102', `Expected a type, found ${this.describe(token)}.`);
  }

  private annotations(): Annotation[] {
    const annotations: Annotation[] = [];
    while (this.matchValue('@')) {
      const start = this.previous().span.start;
      const nameToken = this.consumeName('Expected an annotation name after @.');
      const args: Expression[] = [];
      let end = nameToken.span.end;
      if (this.matchValue('(')) {
        if (!this.checkValue(')')) {
          do args.push(this.annotationArgument());
          while (this.matchValue(','));
        }
        end = this.consumeValue(')', 'Expected ) after annotation arguments.').span.end;
      }
      annotations.push({ name: nameToken.value.toLowerCase(), args, span: { start, end } });
    }
    return annotations;
  }

  private findStatement(): FindStatement {
    const start = this.consumeValue('FIND').span.start;
    const collection = this.consumeIdentifier('Expected a collection name after FIND.');
    this.consumeValue('SELECT', 'Expected SELECT after collection name.');
    const projection = [this.fieldPath()];
    while (this.matchValue(',')) projection.push(this.fieldPath());

    let where: Expression | undefined;
    let orderBy: FindStatement['orderBy'];
    let limit: number | undefined;
    let offset: number | undefined;

    if (this.matchValue('WHERE')) where = this.expression();
    if (this.matchValue('ORDER')) {
      this.consumeValue('BY', 'Expected BY after ORDER.');
      const field = this.fieldPath();
      const direction = this.matchValue('DESC') ? 'DESC' : (this.matchValue('ASC'), 'ASC');
      orderBy = { field, direction };
    }
    if (this.matchValue('LIMIT')) limit = Number(this.consumeInteger('Expected integer after LIMIT.').value);
    if (this.matchValue('OFFSET')) offset = Number(this.consumeInteger('Expected integer after OFFSET.').value);

    return {
      type: 'Find',
      collection,
      projection,
      where,
      orderBy,
      limit,
      offset,
      span: { start, end: this.previous().span.end },
    };
  }

  private annotationArgument(): Expression {
    if (this.check('identifier') && this.peekNext().value === ':') {
      const name = this.advance();
      this.advance();
      const value = this.expression();
      return {
        type: 'NamedArgument',
        name: name.value,
        value,
        span: { start: name.span.start, end: value.span.end },
      };
    }
    return this.expression();
  }

  private putStatement(): PutStatement {
    const start = this.consumeValue('PUT').span.start;
    const id = this.recordId();
    const fields = this.objectLiteral();
    return { type: 'Put', id, fields, span: { start, end: this.previous().span.end } };
  }

  private createStatement(): CreateStatement {
    const start = this.consumeValue('CREATE').span.start;
    const first = this.consumeIdentifier('Expected a collection name after CREATE.');
    const id = this.matchValue(':') ? this.recordIdAfterCollection(first) : undefined;
    const fields = this.objectLiteral();
    return {
      type: 'Create',
      id,
      collection: first,
      fields,
      span: { start, end: this.previous().span.end },
    };
  }

  private deleteStatement(): DeleteStatement {
    const start = this.consumeValue('DELETE').span.start;
    const collection = this.consumeIdentifier('Expected a collection name after DELETE.');
    if (this.matchValue(':')) {
      const id = this.recordIdAfterCollection(collection);
      return { type: 'Delete', target: { kind: 'record', id }, span: { start, end: id.span.end } };
    }
    if (!this.matchValue('WHERE')) {
      throw this.failure('COLT1103', 'DELETE requires a record id or WHERE clause; bare collection deletes are forbidden.');
    }
    const expression = this.expression();
    return {
      type: 'Delete',
      target: { kind: 'where', collection, expression },
      span: { start, end: expression.span.end },
    };
  }

  private atomicStatement(): AtomicStatement {
    const start = this.consumeValue('ATOMIC').span.start;
    this.consumeValue('{', 'Expected { after ATOMIC.');
    const statements: AtomicStatement['statements'] = [];
    while (!this.checkValue('}') && !this.check('eof')) {
      if (this.checkValue('PUT')) statements.push(this.putStatement());
      else if (this.checkValue('CREATE')) statements.push(this.createStatement());
      else if (this.checkValue('DELETE')) statements.push(this.deleteStatement());
      else if (reservedStatements.has(this.peek().value)) this.reserved(this.peek());
      else throw this.failure('COLT1104', 'ATOMIC supports PUT, CREATE, and DELETE statements in M1.');
      this.matchValue(';');
    }
    const end = this.consumeValue('}', 'Expected } after ATOMIC statements.').span.end;
    return { type: 'Atomic', statements, span: { start, end } };
  }

  private objectLiteral(): ObjectField[] {
    this.consumeValue('{', 'Expected { before record fields.');
    const fields: ObjectField[] = [];
    while (!this.checkValue('}') && !this.check('eof')) {
      const start = this.peek().span.start;
      const name = this.consumeIdentifier('Expected a field name in record literal.');
      this.consumeValue(':', 'Expected : after record field name.');
      const value = this.expression();
      fields.push({ name, value, span: { start, end: value.span.end } });
      if (!this.matchValue(',')) break;
    }
    this.consumeValue('}', 'Expected } after record fields.');
    return fields;
  }

  private recordId(): RecordId {
    const collection = this.consumeIdentifier('Expected a collection name.');
    this.consumeValue(':', 'Expected : before record key.');
    return this.recordIdAfterCollection(collection);
  }

  private recordIdAfterCollection(collection: string): RecordId {
    const key = this.advance();
    if (!['identifier', 'string', 'integer', 'uuid'].includes(key.kind)) {
      throw this.failure('COLT1105', 'Record keys must be identifiers, strings, or integers.', key);
    }
    return {
      collection,
      key: key.value,
      span: { start: this.tokens[this.current - 2]?.span.start ?? key.span.start, end: key.span.end },
    };
  }

  private fieldPath(): FieldPath {
    const rootToken = this.consumeIdentifierToken('Expected a field name.');
    const segments: Array<string | number> = [];
    let end = rootToken.span.end;
    while (true) {
      if (this.matchValue('.')) {
        const segment = this.consumeIdentifierToken('Expected a document field after .');
        segments.push(segment.value);
        end = segment.span.end;
      } else if (this.matchValue('[')) {
        const index = this.consumeInteger('Expected an integer index inside [].');
        this.consumeValue(']', 'Expected ] after document index.');
        segments.push(Number(index.value));
        end = this.previous().span.end;
      } else break;
    }
    return { type: 'FieldPath', root: rootToken.value, segments, span: { start: rootToken.span.start, end } };
  }

  private expression(minPrecedence = 1): Expression {
    let left = this.unary();
    while (true) {
      const operator = this.peek().value;
      const operatorPrecedence = precedence.get(operator);
      if (operatorPrecedence === undefined || operatorPrecedence < minPrecedence) break;
      this.advance();
      const right = this.expression(operatorPrecedence + 1);
      left = {
        type: 'Binary',
        operator,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  private unary(): Expression {
    if (this.matchValue('NOT') || this.matchValue('-')) {
      const operator = this.previous();
      const operand = this.unary();
      return {
        type: 'Unary',
        operator: operator.value,
        operand,
        span: { start: operator.span.start, end: operand.span.end },
      };
    }
    return this.primary();
  }

  private primary(): Expression {
    const token = this.peek();
    if (this.match('integer') || this.match('float')) {
      return { type: 'NumberLiteral', kind: token.kind as 'integer' | 'float', raw: token.value, span: token.span };
    }
    if (this.match('uuid')) return { type: 'Literal', kind: 'uuid', value: token.value, raw: token.lexeme, span: token.span };
    if (this.match('duration')) return { type: 'DurationLiteral', raw: token.value, span: token.span };
    if (this.match('time')) return { type: 'TimeLiteral', raw: token.value, span: token.span };
    if (this.match('string')) return { type: 'Literal', kind: 'string', value: token.value, raw: token.lexeme, span: token.span };
    if (this.match('parameter')) return { type: 'Parameter', name: token.value, span: token.span };
    if (this.matchValue('TRUE')) return { type: 'Literal', kind: 'bool', value: true, raw: token.lexeme, span: token.span };
    if (this.matchValue('FALSE')) return { type: 'Literal', kind: 'bool', value: false, raw: token.lexeme, span: token.span };
    if (this.matchValue('NULL')) return { type: 'Literal', kind: 'null', value: null, raw: token.lexeme, span: token.span };
    if (this.matchValue('(')) {
      const expression = this.expression();
      this.consumeValue(')', 'Expected ) after expression.');
      return expression;
    }
    if (this.checkValue('{')) {
      const start = this.peek().span.start;
      const fields = this.objectLiteral();
      return { type: 'ObjectLiteral', fields, span: { start, end: this.previous().span.end } };
    }
    if (this.matchValue('[')) {
      const start = token.span.start;
      const items: Expression[] = [];
      if (!this.checkValue(']')) {
        do items.push(this.expression());
        while (this.matchValue(','));
      }
      const end = this.consumeValue(']', 'Expected ] after list literal.').span.end;
      return { type: 'ListLiteral', items, span: { start, end } };
    }
    if (token.kind === 'identifier' || (token.kind === 'keyword' && !['AND', 'OR', 'IN', 'NOT'].includes(token.value))) {
      const name = this.advance();
      if (this.matchValue(':')) {
        const id = this.recordIdAfterCollection(name.value);
        return { type: 'RecordReference', id, span: id.span };
      }
      if (name.value === 'NOW' && !this.checkValue('(')) {
        return { type: 'Call', name: 'now', args: [], span: name.span };
      }
      if (this.matchValue('(')) {
        const args: Expression[] = [];
        if (!this.checkValue(')')) {
          do args.push(this.expression());
          while (this.matchValue(','));
        }
        const end = this.consumeValue(')', 'Expected ) after function arguments.').span.end;
        return { type: 'Call', name: name.value, args, span: { start: name.span.start, end } };
      }
      const segments: Array<string | number> = [];
      let end = name.span.end;
      while (true) {
        if (this.matchValue('.')) {
          const segment = this.consumeIdentifier('Expected a field path segment after .');
          segments.push(segment);
          end = this.previous().span.end;
        } else if (this.matchValue('[')) {
          const index = this.consumeInteger('Expected an integer index inside [].');
          end = this.consumeValue(']', 'Expected ] after document index.').span.end;
          segments.push(Number(index.value));
        } else break;
      }
      return { type: 'FieldPath', root: name.value, segments, span: { start: name.span.start, end } };
    }
    if (reservedClauses.has(token.value) || reservedStatements.has(token.value)) this.reserved(token);
    throw this.failure('COLT1106', `Expected an expression, found ${this.describe(token)}.`);
  }

  private consumeIdentifier(message: string): string {
    return this.consumeIdentifierToken(message).value;
  }

  private consumeIdentifierToken(message: string): ColtToken {
    if (this.check('identifier')) return this.advance();
    throw this.failure('COLT1107', message);
  }

  private consumeName(message: string): ColtToken {
    if (this.check('identifier') || this.check('keyword')) return this.advance();
    throw this.failure('COLT1108', message);
  }

  private consumeInteger(message: string): ColtToken {
    if (this.check('integer')) return this.advance();
    throw this.failure('COLT1109', message);
  }

  private consumeString(message: string): string {
    if (this.check('string')) return this.advance().value;
    throw this.failure('COLT1106', message);
  }

  private consumeValue(value: string, message = `Expected ${value}.`): ColtToken {
    if (this.matchValue(value)) return this.previous();
    throw this.failure('COLT1110', message);
  }

  private matchValue(value: string): boolean {
    if (!this.checkValue(value)) return false;
    this.advance();
    return true;
  }

  private match(kind: string): boolean {
    if (!this.check(kind)) return false;
    this.advance();
    return true;
  }

  private check(kind: string): boolean {
    return this.peek().kind === kind;
  }

  private checkValue(value: string): boolean {
    return this.peek().value === value;
  }

  private advance(): ColtToken {
    if (!this.check('eof')) this.current += 1;
    return this.previous();
  }

  private previous(): ColtToken {
    return this.tokens[Math.max(0, this.current - 1)];
  }

  private peek(): ColtToken {
    return this.tokens[this.current] ?? this.tokens[this.tokens.length - 1];
  }

  private peekNext(): ColtToken {
    return this.tokens[this.current + 1] ?? this.tokens[this.tokens.length - 1];
  }

  private failure(code: string, message: string, token = this.peek()): ParseFailure {
    return new ParseFailure({ code, message, span: token.span });
  }

  private reserved(token: ColtToken): never {
    const milestone = token.value === 'FETCH' || token.value === 'RELATE' ? 'M10' : 'a later milestone';
    throw this.failure('COLT2003', `Construct ${token.value} is reserved for ${milestone}.`, token);
  }

  private describe(token: ColtToken): string {
    return token.kind === 'eof' ? 'end of input' : JSON.stringify(token.lexeme);
  }

  private synchronize(): void {
    while (!this.check('eof')) {
      if (this.previous().value === ';' || statementKeywords.has(this.peek().value)) return;
      this.advance();
    }
  }
}

function combineLexDiagnostics(diagnostics: ColtDiagnostic[]): ColtDiagnostic[] {
  return diagnostics;
}

export function parse(source: string): { program: Program; diagnostics: ColtDiagnostic[] } {
  try {
    return new Parser(lex(source)).run();
  } catch {
    const emptySpan: SourceSpan = {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 },
    };
    return {
      program: { type: 'Program', statements: [], span: emptySpan },
      diagnostics: combineLexDiagnostics([
        { code: 'COLT1099', message: 'Parser recovered from an unexpected internal error.', span: emptySpan },
      ]),
    };
  }
}
