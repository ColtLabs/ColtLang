import { describe, expect, it } from 'vitest';
import { lex } from '../packages/parser/src/index.js';

describe('Colt lexer', () => {
  it('normalizes keywords but preserves identifier case and source spans', () => {
    const result = lex('find UserProfiles SELECT email');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map(({ kind, value }) => [kind, value])).toEqual([
      ['keyword', 'FIND'],
      ['identifier', 'UserProfiles'],
      ['keyword', 'SELECT'],
      ['identifier', 'email'],
      ['eof', ''],
    ]);
    expect(result.tokens[1].span).toEqual({
      start: { offset: 5, line: 1, column: 6 },
      end: { offset: 17, line: 1, column: 18 },
    });
  });

  it('recognizes supported literal and parameter forms', () => {
    const result = lex('$owner 42 3.5 30m "line\\n\\u0041" 2026-09-30T12:30:00Z');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map(({ kind, value }) => [kind, value])).toEqual([
      ['parameter', 'owner'],
      ['integer', '42'],
      ['float', '3.5'],
      ['duration', '30m'],
      ['string', 'line\nA'],
      ['time', '2026-09-30T12:30:00Z'],
      ['eof', ''],
    ]);
  });

  it('skips line and block comments and preserves following line positions', () => {
    const result = lex('-- comment\n/* block */ FIND users');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens[0]).toMatchObject({
      kind: 'keyword',
      value: 'FIND',
      span: { start: { line: 2, column: 13 } },
    });
  });

  it('recognizes reserved later-stage syntax as keywords', () => {
    const result = lex('LIVE FIND docs NEAREST embedding');

    expect(result.tokens.slice(0, 4).map(({ kind, value }) => [kind, value])).toEqual([
      ['keyword', 'LIVE'],
      ['keyword', 'FIND'],
      ['identifier', 'docs'],
      ['keyword', 'NEAREST'],
    ]);
  });

  it('reports malformed tokens as diagnostics rather than throwing', () => {
    const result = lex('$ "unterminated\n@');

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['COLT1002', 'COLT1005']);
    expect(result.tokens.at(-1)?.kind).toBe('eof');
  });

  it('accepts and ignores first-line shebang', () => {
    const result = lex('#!/usr/bin/env colt\n#colt 0.2\nFIND books');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map(({ kind, value }) => [kind, value])).toEqual([
      ['pragma', '0.2'],
      ['keyword', 'FIND'],
      ['identifier', 'books'],
      ['eof', ''],
    ]);
  });
});