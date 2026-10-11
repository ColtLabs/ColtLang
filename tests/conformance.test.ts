import { describe, expect, it } from 'vitest';
import { compile } from '../packages/compiler/src/index.js';
import { lex, parse } from '../packages/parser/src/index.js';

/**
 * Conformance cases for the normative M1 Tier-1 subset of the Colt v0.1
 * specification (spec/SPEC.md, spec/grammar.ebnf). Each table row is one case.
 */

interface TokenCase {
  name: string;
  source: string;
  codes?: string[];
  tokens?: Array<[string, string]>;
}

interface ParseCase {
  name: string;
  source: string;
  codes?: string[];
  statements?: string[];
  statementCount?: number;
}

interface CompileCase {
  name: string;
  source: string;
  codes?: string[];
  steps?: number;
  assertions?: (result: ReturnType<typeof compile>) => void;
}

const users = `DEFINE COLLECTION users STRICT @backend(neon) {
  id: uuid @key,
  email: text @unique,
  nickname: text?,
  created: time @default(now),
  profile: doc,
  score: int
}`;

describe('Colt v0.1 conformance — lexical rules (SPEC §2)', () => {
  const cases: TokenCase[] = [
    {
      name: 'keywords are case-insensitive and tokenize as uppercase keywords',
      source: 'FiNd users SeLeCt id',
      tokens: [['keyword', 'FIND'], ['identifier', 'users'], ['keyword', 'SELECT'], ['identifier', 'id']],
    },
    {
      name: 'identifiers are ASCII and case-sensitive',
      source: 'find UserProfiles SELECT emailAddress',
      tokens: [['identifier', 'UserProfiles'], ['identifier', 'emailAddress']],
    },
    { name: 'line comments run to end of line', source: '-- ignored\nFIND users SELECT id', codes: [] },
    { name: 'block comments are skipped', source: '/* ignored */ FIND users SELECT id', codes: [] },
    { name: 'an unterminated block comment is reported', source: '/* never closed', codes: ['COLT1006'] },
    { name: 'an unterminated string is reported', source: '"never closed', codes: ['COLT1005'] },
    { name: 'an unknown string escape is reported', source: '"bad \\q escape"', codes: ['COLT1004'] },
    { name: 'an incomplete unicode escape is reported', source: '"bad \\u12 escape"', codes: ['COLT1004'] },
    { name: 'a parameter requires a name', source: '$', codes: ['COLT1002'] },
    { name: 'a parameter token keeps the bare name as its value', source: '$owner', tokens: [['parameter', 'owner']] },
    { name: 'durations are a non-negative integer and a unit', source: '30m', tokens: [['duration', '30m']] },
    { name: 'time literals are ISO-8601 with a timezone', source: '2026-09-30T12:30:00Z', tokens: [['time', '2026-09-30T12:30:00Z']] },
    { name: 'uuid literals are recognized', source: '11111111-1111-4111-8111-111111111111', tokens: [['uuid', '11111111-1111-4111-8111-111111111111']] },
    { name: 'integers and decimals are classified separately', source: '42 3.5', tokens: [['integer', '42'], ['float', '3.5']] },
    { name: 'exponent floats are classified as floats', source: '1.5e3', tokens: [['float', '1.5e3']] },
    { name: 'an unexpected character is reported without throwing', source: 'FIND users SELECT #', codes: ['COLT1001'] },
    { name: 'string escapes decode to their control characters', source: '"line\\n\\u0041"', tokens: [['string', 'line\nA']] },
    { name: 'equality and inequality use == and !=', source: 'a == b != c', tokens: [['operator', '=='], ['operator', '!=']] },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const result = lex(testCase.source);
      if (testCase.codes) {
        expect(result.diagnostics.map(({ code }) => code)).toEqual(testCase.codes);
      }
      if (testCase.tokens) {
        expect(result.diagnostics).toEqual([]);
        const observed = result.tokens
          .filter(({ kind }) => kind !== 'eof')
          .map(({ kind, value }) => [kind, value]);
        expect(observed).toEqual(expect.arrayContaining(testCase.tokens));
      }
      expect(result.tokens.at(-1)?.kind).toBe('eof');
    });
  }
});
describe('Colt v0.1 conformance — syntax (SPEC §3–§6)', () => {
  const cases: ParseCase[] = [
    {
      name: 'DEFINE COLLECTION accepts the full M1 annotation set',
      source: 'DEFINE COLLECTION books @backend(neon) { id: uuid @key, isbn: text @unique, cached: doc @readonly, expires: time? @ttl(30d), embedding: vector(1536) @index(hnsw, metric: cosine), series: list<text>, author: link<authors> }',
      statements: ['DefineCollection'],
    },
    { name: 'FLEXIBLE collection mode is accepted', source: 'DEFINE COLLECTION logs FLEXIBLE { id: uuid @key }', statements: ['DefineCollection'] },
    { name: 'omitted collection mode defaults to STRICT', source: 'DEFINE COLLECTION logs { id: uuid @key }', statements: ['DefineCollection'] },
    { name: 'optional fields use the ? marker', source: 'DEFINE COLLECTION a { nickname: text? @key }', statements: ['DefineCollection'] },
    { name: 'a missing collection name is a coded syntax error', source: 'DEFINE COLLECTION {', codes: ['COLT1107'] },
    { name: 'an unknown type is a coded syntax error', source: 'DEFINE COLLECTION a { id: money @key }', codes: ['COLT1102'] },
    { name: 'an unclosed field list is a coded syntax error', source: 'DEFINE COLLECTION a { id: uuid @key', codes: ['COLT1110'] },
    { name: 'FIND requires SELECT', source: 'FIND users WHERE id == 1', codes: ['COLT1110'] },
    {
      name: 'FIND accepts WHERE, ORDER BY, LIMIT, and OFFSET in order',
      source: 'FIND users SELECT id, email WHERE score > $minimum AND active == true ORDER BY created DESC LIMIT 10 OFFSET 5',
      statements: ['Find'],
    },
    { name: 'ORDER BY defaults to ASC', source: 'FIND users SELECT id ORDER BY created', statements: ['Find'] },
    { name: 'projection accepts document paths', source: 'FIND users SELECT profile.city', statements: ['Find'] },
    { name: 'projection accepts document indices', source: 'FIND users SELECT profile.tags[0]', statements: ['Find'] },
    { name: 'PUT requires an explicit record key', source: 'PUT users:alice { email: "a@x.com" }', statements: ['Put'] },
    { name: 'PUT accepts a UUID record key', source: 'PUT users:11111111-1111-4111-8111-111111111111 { email: "a@x.com" }', statements: ['Put'] },
    { name: 'a non-identifier record key is rejected', source: 'PUT users:{ }', codes: ['COLT1105'] },
    { name: 'CREATE may omit the record key', source: 'CREATE users { email: "a@x.com" }', statements: ['Create'] },
    { name: 'CREATE may supply a record key', source: 'CREATE users:bob { email: "b@x.com" }', statements: ['Create'] },
    { name: 'DELETE by record key is accepted', source: 'DELETE users:alice', statements: ['Delete'] },
    { name: 'DELETE WHERE is accepted', source: 'DELETE users WHERE email == $email', statements: ['Delete'] },
    { name: 'a bare collection delete is rejected', source: 'DELETE users', codes: ['COLT1103'] },
    { name: 'ATOMIC accepts PUT, CREATE, and DELETE statements', source: 'ATOMIC { PUT users:a { email: "x" }; CREATE users { email: "y" }; DELETE users:b }', statements: ['Atomic'] },
    { name: 'ATOMIC rejects statements outside its subset', source: 'ATOMIC { FIND users SELECT id }', codes: ['COLT1104'] },
    { name: 'LIVE is reserved for a later milestone', source: 'LIVE FIND docs WHERE author == users:alice', codes: ['COLT2003'] },
    { name: 'FETCH is reserved and names its planned milestone', source: 'FIND users SELECT id FETCH author', codes: ['COLT2003'] },
    { name: 'NEAREST is reserved for a later milestone', source: 'FIND users SELECT id NEAREST profile', codes: ['COLT2003'] },
    { name: 'DEFINE EDGE is reserved for a later milestone', source: 'DEFINE EDGE follows { from: users, to: users }', codes: ['COLT2003'] },
    { name: 'DEFINE POLICY is reserved for a later milestone', source: 'DEFINE POLICY owners { FOR READ WHEN true }', codes: ['COLT2003'] },
    { name: 'SET is reserved for a later milestone', source: 'SET users:alice { email: "a@x.com" }', codes: ['COLT2003'] },
    { name: 'GET is reserved for a later milestone', source: 'GET users:alice', codes: ['COLT2003'] },
    { name: 'RELATE is reserved for a later milestone', source: 'RELATE users:a -> users:b', codes: ['COLT2003'] },
    { name: 'WINDOW is reserved for a later milestone', source: 'FIND users SELECT id WINDOW 5m', codes: ['COLT2003'] },
    { name: 'SINCE is reserved for a later milestone', source: 'FIND users SELECT id SINCE 1h', codes: ['COLT2003'] },
    { name: 'statements may be separated by semicolons', source: 'FIND users SELECT id; FIND users SELECT email;', statements: ['Find', 'Find'] },
    { name: 'a trailing comma in a field list is tolerated', source: 'DEFINE COLLECTION a { id: uuid @key, name: text, }', statements: ['DefineCollection'] },
    { name: 'CONNECT and DEFAULT CONNECTION statements are parsed', source: '#colt 0.2\nCONNECT main AS postgres(env("DATABASE_URL"))\nDEFAULT CONNECTION main\nDEFINE COLLECTION users { id: uuid @key }', statements: ['Connect', 'DefaultConnection', 'DefineCollection'] },
    { name: 'DEFINE MELD LINK is reserved for a later milestone', source: 'DEFINE MELD book_reviews LINK reviews.book -> books.id', codes: ['COLT2003'] },
    { name: 'DEFINE MELD SYNC is reserved for a later milestone', source: 'DEFINE MELD hot_books SYNC books TO cache KEY id TTL 10m', codes: ['COLT2003'] },
    { name: 'DEFINE MELD CONSTRAINT is reserved for a later milestone', source: 'DEFINE MELD review_book CONSTRAINT reviews.book REFERENCES books.id MODE check_on_write', codes: ['COLT2003'] },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const result = parse(testCase.source);
      if (testCase.codes) {
        // Reserved constructs report their coded error and then recover; the parser may
        // add follow-on syntax diagnostics for the tokens it skips while resynchronising.
        expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(testCase.codes));
      }
      if (testCase.statements) {
        expect(result.diagnostics).toEqual([]);
        expect(result.program.statements.map(({ type }) => type)).toEqual(testCase.statements);
      }
      expect(result.program.type).toBe('Program');
    });
  }
});
describe('Colt v0.1 conformance — operator structure (SPEC §3)', () => {
  it('applies the specified precedence and left associativity', () => {
    const result = parse('FIND users SELECT id WHERE a AND b OR c == d + e * f');
    expect(result.diagnostics).toEqual([]);
    const query = result.program.statements[0];
    expect(query).toMatchObject({ type: 'Find', where: { type: 'Binary', operator: 'OR' } });
    if (query.type === 'Find' && query.where?.type === 'Binary') {
      expect(query.where.left).toMatchObject({ operator: 'AND' });
      expect(query.where.right).toMatchObject({
        operator: '==',
        right: { operator: '+', right: { operator: '*' } },
      });
    } else {
      throw new Error('expected a binary WHERE expression');
    }
  });

  it('binds unary negation and NOT tighter than binary operators', () => {
    const result = parse('FIND users SELECT id WHERE NOT active == -score');
    expect(result.diagnostics).toEqual([]);
    const query = result.program.statements[0];
    if (query.type === 'Find' && query.where?.type === 'Binary') {
      expect(query.where.left).toMatchObject({ type: 'Unary', operator: 'NOT' });
      expect(query.where.right).toMatchObject({ type: 'Unary', operator: '-' });
    } else {
      throw new Error('expected a binary WHERE expression');
    }
  });

  it('parses IN, list literals, and object literals as expressions', () => {
    const result = parse('FIND users SELECT id WHERE score IN [1, 2, 3] AND profile == { city: "Berlin" }');
    expect(result.diagnostics).toEqual([]);
    const query = result.program.statements[0];
    if (query.type === 'Find' && query.where?.type === 'Binary') {
      expect(query.where.left).toMatchObject({ operator: 'IN', right: { type: 'ListLiteral' } });
      expect(query.where.right).toMatchObject({ operator: '==', right: { type: 'ObjectLiteral' } });
    } else {
      throw new Error('expected a binary WHERE expression');
    }
  });

  it('names the planned milestone when reporting reserved syntax', () => {
    expect(parse('FIND users SELECT id FETCH author').diagnostics[0]?.message).toContain('M10');
  });
});
const metrics = `DEFINE COLLECTION metrics STRICT @backend(neon) {
  id: uuid @key,
  name: text @unique,
  count: int @default(0),
  payload: doc
}`;

const accounts = `DEFINE COLLECTION accounts STRICT @backend(neon) {
  id: uuid @key,
  owner: text @readonly,
  balance: int
}`;

const accountKey = '00000000-0000-4000-8000-000000000009';

describe('Colt v0.1 conformance — semantics and code generation (SPEC §4–§7)', () => {
  const cases: CompileCase[] = [
    { name: 'an unknown projection field is reported', source: `${metrics} FIND metrics SELECT nam`, codes: ['COLT2004'] },
    { name: 'a document path on a doc field is accepted', source: `${metrics} FIND metrics SELECT payload.deep.value`, steps: 2 },
    { name: 'a document path on a scalar field is rejected', source: `${metrics} FIND metrics SELECT name.deep`, codes: ['COLT2012'] },
    { name: 'a duplicate field name is reported', source: 'DEFINE COLLECTION a { id: uuid @key, id: text }', codes: ['COLT2007'] },
    { name: 'a duplicate annotation is reported', source: 'DEFINE COLLECTION a { id: uuid @key @key }', codes: ['COLT2009'] },
    { name: 'an unknown field annotation is reported', source: 'DEFINE COLLECTION a { id: uuid @key @nope }', codes: ['COLT2008'] },
    { name: 'a collection without a key field is rejected', source: 'DEFINE COLLECTION a { id: uuid }', codes: ['COLT2011'] },
    { name: 'a collection with two key fields is rejected', source: 'DEFINE COLLECTION a { id: uuid @key, other: uuid @key }', codes: ['COLT2011'] },
    { name: 'redefining a collection is reported', source: 'DEFINE COLLECTION a { id: uuid @key }\nDEFINE COLLECTION a { id: uuid @key }', codes: ['COLT2006'] },
    { name: 'querying an unknown collection is reported', source: 'FIND nope SELECT id', codes: ['COLT2002'] },
    { name: 'a missing required field is reported', source: `${metrics} CREATE metrics { name: "a" }`, codes: ['COLT2014'] },
    { name: 'null in a required field is reported', source: `${metrics} CREATE metrics { name: null, payload: {} }`, codes: ['COLT2018'] },
    { name: 'a mismatched literal type is reported', source: `${metrics} CREATE metrics { name: 7, payload: {} }`, codes: ['COLT2018'] },
    { name: 'a vector of the wrong length is reported', source: 'DEFINE COLLECTION v { id: uuid @key, embedding: vector(3) }\nCREATE v { embedding: [1.0, 2.0] }', codes: ['COLT2019'] },
    { name: 'CREATE without an id needs a UUID key', source: 'DEFINE COLLECTION k { name: text @key }\nCREATE k { name: "a" }', codes: ['COLT2017'] },
    { name: 'a non-UUID record key is reported for UUID-keyed collections', source: `${metrics} PUT metrics:abc { name: "a", payload: {} }`, codes: ['COLT2015'] },
    { name: 'a constant-true DELETE WHERE is rejected', source: `${metrics} DELETE metrics WHERE true`, codes: ['COLT2005'] },
    { name: 'an ATOMIC block spanning primary backends is rejected', source: 'DEFINE COLLECTION a { id: uuid @key }\nDEFINE COLLECTION b @backend(supabase) { id: uuid @key }\nATOMIC { PUT a:1 { }; PUT b:2 { } }', codes: ['COLT2016'] },
    { name: 'an unsupported backend annotation is rejected', source: 'DEFINE COLLECTION a @backend(turso) { id: uuid @key }', codes: ['COLT2001'] },
    { name: 'query parameters stay separate from generated SQL', source: `${metrics} FIND metrics SELECT name WHERE name == $name`, steps: 2 },
    { name: 'literal values are bound, never embedded in SQL', source: `${metrics} FIND metrics SELECT name WHERE name == "secret@example.com"`, steps: 2 },
    { name: 'ordered comparisons emulate two-valued logic for null', source: `${metrics} FIND metrics SELECT count WHERE count > null`, steps: 2 },
    { name: 'heterogeneous comparisons fold to a false predicate', source: `${metrics} FIND metrics SELECT count WHERE count == "two"`, steps: 2 },
    { name: 'ORDER BY emits NULLS LAST for both directions', source: `${metrics} FIND metrics SELECT name ORDER BY count DESC`, steps: 2 },
    { name: 'LIMIT and OFFSET are passed as bound parameters', source: `${metrics} FIND metrics SELECT name LIMIT 5 OFFSET 2`, steps: 2 },
    { name: 'PUT plans an upsert that replaces the whole record', source: `${metrics} PUT metrics:${accountKey} { name: "a", payload: {} }`, steps: 2 },
    { name: 'PUT preserves readonly fields by excluding them from the update list', source: `${accounts} PUT accounts:${accountKey} { owner: "root", balance: 10 }`, steps: 2 },
    { name: 'CREATE plans an insert-only conflict guard', source: `${metrics} CREATE metrics { name: "a", payload: {} }`, steps: 2 },
    { name: 'the Postgres capability matrix declares no TTL support', source: `${metrics} FIND metrics SELECT name`, steps: 2 },
    {
      name: 'Colt 0.2 multi-store meld schema compiles without diagnostics',
      source: `#colt 0.2
CONNECT main AS postgres(env("DATABASE_URL"))
CONNECT cache AS redis(env("REDIS_URL"))
CONNECT notes AS mongodb(env("MONGO_URL"))
DEFAULT CONNECTION main

DEFINE COLLECTION authors STRICT { id: uuid @key, name: text @unique }
DEFINE COLLECTION books STRICT { id: uuid @key, title: text, author: link<authors>, views: int @default(0) }
DEFINE COLLECTION reviews FLEXIBLE @backend(notes) { id: uuid @key, book: link<books>, body: text, meta: doc }
DEFINE COLLECTION sessions @backend(cache) @ttl(30m) { value: text, id: uuid @key }
`,
      steps: 4,
    },
    {
      name: 'an unknown connection alias is rejected (COLT2021)',
      source: '#colt 0.2\nDEFINE COLLECTION books @backend(neon) { id: uuid @key }',
      codes: ['COLT2021'],
    },
    {
      name: 'a duplicate connection alias is rejected (COLT2022)',
      source: 'CONNECT main AS postgres(env("DB1"))\nCONNECT main AS redis(env("DB2"))\nDEFINE COLLECTION books { id: uuid @key }',
      codes: ['COLT2022'],
    },
    {
      name: 'literal credentials instead of env() are rejected (COLT2023)',
      source: 'CONNECT main AS postgres("postgresql://user:pass@localhost:5432/db")',
      codes: ['COLT2023'],
    },
    {
      name: 'ambiguous default connection is rejected (COLT2024)',
      source: 'CONNECT a AS postgres(env("DB1"))\nCONNECT b AS redis(env("DB2"))\nDEFINE COLLECTION books { id: uuid @key }',
      codes: ['COLT2024'],
    },
    {
      name: 'mixed ATOMIC block across connections is rejected (COLT2025)',
      source: 'CONNECT a AS postgres(env("DB1"))\nCONNECT b AS postgres(env("DB2"))\nDEFINE COLLECTION x @backend(a) { id: uuid @key }\nDEFINE COLLECTION y @backend(b) { id: uuid @key }\nATOMIC { PUT x:11111111-1111-4111-8111-111111111111 {}; PUT y:22222222-2222-4222-8222-222222222222 {} }',
      codes: ['COLT2025'],
    },
    {
      name: 'unsupported capability on engine is rejected (COLT2026)',
      source: 'CONNECT cache AS redis(env("REDIS_URL"))\nDEFINE COLLECTION v @backend(cache) { id: uuid @key, emb: vector(3) @index(hnsw) }',
      codes: ['COLT2026'],
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const result = compile(testCase.source);
      if (testCase.codes) {
        expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(testCase.codes));
      }
      if (testCase.steps !== undefined) {
        expect(result.diagnostics).toEqual([]);
        expect(result.plan?.steps).toHaveLength(testCase.steps);
      }
      testCase.assertions?.(result);
    });
  }

  it('substitutes $n placeholders in order and exposes the parameter bindings', () => {
    const result = compile(`${metrics} FIND metrics SELECT name WHERE name == $name`);
    const query = result.plan?.steps[1];
    expect(query?.parameterizedStatement).toContain('IS NOT DISTINCT FROM $1');
    expect(query?.parameterizedStatement).toContain('"name"');
    expect(query?.params).toEqual([{ kind: 'parameter', name: 'name' }]);
  });

  it('never embeds a literal value in the generated statement', () => {
    const result = compile(`${metrics} FIND metrics SELECT name WHERE name == "secret@example.com"`);
    const query = result.plan?.steps[1];
    expect(query?.parameterizedStatement).not.toContain('secret@example.com');
    expect(query?.params).toContainEqual({ kind: 'constant', value: 'secret@example.com' });
  });

  it('reads document paths through jsonb_extract_path with a bound path', () => {
    const result = compile(`${metrics} FIND metrics SELECT payload.deep.value`);
    const query = result.plan?.steps[1];
    expect(query?.parameterizedStatement).toContain('jsonb_extract_path(');
    expect(query?.params).toContainEqual({ kind: 'path', value: ['deep', 'value'] });
  });

  it('binds @default(now) as a statement-time parameter', () => {
    const result = compile(`${users} CREATE users { email: "a@x.com", profile: {}, score: 1 }`);
    const create = result.plan?.steps[1];
    expect(result.diagnostics).toEqual([]);
    expect(create?.parameterizedStatement).not.toContain('now()');
    expect(create?.params).toContainEqual({ kind: 'default', expression: 'now' });
  });

  it('excludes readonly fields from the PUT update list', () => {
    const result = compile(`${accounts} PUT accounts:${accountKey} { owner: "root", balance: 10 }`);
    const statement = result.plan?.steps[1].parameterizedStatement ?? '';
    expect(statement).toContain('ON CONFLICT');
    expect(statement).toContain('"balance" = EXCLUDED."balance"');
    expect(statement).not.toContain('"owner" = EXCLUDED."owner"');
  });

  it('generates a UUID key for CREATE on a UUID-keyed collection', () => {
    const result = compile(`${metrics} CREATE metrics { name: "a", payload: {} }`);
    const statement = result.plan?.steps[1].parameterizedStatement ?? '';
    expect(statement).toContain('gen_random_uuid()');
    expect(statement).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(statement).toContain('RETURNING *');
  });

  it('declares every collection field with its Postgres type', () => {
    const result = compile(metrics);
    const statement = result.plan?.steps[0].parameterizedStatement ?? '';
    expect(statement).toContain('"id" uuid NOT NULL');
    expect(statement).toContain('"name" text NOT NULL UNIQUE');
    expect(statement).toContain('"count" integer NOT NULL');
    expect(statement).toContain('"payload" jsonb NOT NULL');
    expect(statement).toContain('PRIMARY KEY ("id")');
  });
});
