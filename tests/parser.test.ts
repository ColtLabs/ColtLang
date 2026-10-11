import { describe, expect, it } from 'vitest';
import { parse } from '../packages/parser/src/index.js';

describe('Colt parser', () => {
  it('parses the normative collection, query, mutation, delete, and atomic statements', () => {
    const result = parse(`
      DEFINE COLLECTION accounts STRICT @backend(neon) {
        id: uuid @key,
        email: text @unique,
        created: time @default(now),
        embedding: vector(1536) @index(hnsw, metric: cosine)
      }
      FIND accounts SELECT email WHERE email == $email ORDER BY created DESC LIMIT 10 OFFSET 2
      PUT accounts:alice { email: "a@x.com" }
      CREATE accounts { email: "new@x.com" }
      DELETE accounts WHERE email == $email
      ATOMIC { PUT accounts:bob { email: "b@x.com" }; DELETE accounts:old }
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.program.statements.map(({ type }) => type)).toEqual([
      'DefineCollection',
      'Find',
      'Put',
      'Create',
      'Delete',
      'Atomic',
    ]);
    const definition = result.program.statements[0];
    expect(definition).toMatchObject({
      type: 'DefineCollection',
      mode: 'STRICT',
    });
    if (definition.type === 'DefineCollection') {
      expect(definition.fields[0]).toMatchObject({ name: 'id', valueType: { name: 'uuid' } });
      expect(definition.fields[3].annotations[0].args[1]).toMatchObject({
        type: 'NamedArgument',
        name: 'metric',
      });
    }
  });

  it('uses the specified expression precedence and associativity', () => {
    const result = parse('FIND users SELECT id WHERE age + 2 * 3 >= $minimum AND active == true');

    expect(result.diagnostics).toEqual([]);
    const query = result.program.statements[0];
    expect(query).toMatchObject({ type: 'Find', where: { type: 'Binary', operator: 'AND' } });
    if (query.type === 'Find' && query.where?.type === 'Binary') {
      expect(query.where.left).toMatchObject({
        type: 'Binary',
        operator: '>=',
        left: {
          type: 'Binary',
          operator: '+',
          right: { type: 'Binary', operator: '*' },
        },
      });
    }
  });

  it('reports reserved future syntax with COLT2003 and keeps parsing', () => {
    const result = parse('LIVE FIND docs WHERE author == users:alice; FIND users SELECT id');

    expect(result.diagnostics[0]).toMatchObject({ code: 'COLT2003' });
    expect(result.program.statements).toHaveLength(1);
    expect(result.program.statements[0].type).toBe('Find');
  });

  it('rejects a bare collection delete with a stable syntax diagnostic', () => {
    const result = parse('DELETE users');

    expect(result.diagnostics[0]).toMatchObject({ code: 'COLT1103' });
  });

  it('never throws for malformed source', () => {
    const malformed = ['DEFINE COLLECTION {', 'FIND users WHERE (', 'ATOMIC { RELATE a -> b }', '$', '/*'];

    for (const source of malformed) {
      expect(() => parse(source)).not.toThrow();
      expect(parse(source).program.type).toBe('Program');
    }
  });
});