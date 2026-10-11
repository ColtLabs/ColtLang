import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lex, parse } from '../packages/parser/src/index.js';

interface GrammarRule {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  patterns?: GrammarRule[];
  include?: string;
}

interface TextMateGrammar {
  name: string;
  scopeName: string;
  patterns: GrammarRule[];
  repository: Record<string, { patterns: GrammarRule[] }>;
}

describe('Colt TextMate Grammar & Fixtures', () => {
  const grammarPath = resolve(__dirname, '../editors/vscode/syntaxes/colt.tmLanguage.json');
  const grammarText = readFileSync(grammarPath, 'utf-8');
  const grammar = JSON.parse(grammarText) as TextMateGrammar;

  it('contains valid JSON and required TextMate root properties', () => {
    expect(grammar.name).toBe('Colt');
    expect(grammar.scopeName).toBe('source.colt');
    expect(grammar.patterns.length).toBeGreaterThan(0);
    expect(grammar.repository).toBeDefined();
  });

  it('compiles all regular expressions in the grammar without syntax errors', () => {
    function testRules(rules: GrammarRule[]): void {
      for (const rule of rules) {
        if (rule.match) {
          expect(() => new RegExp(rule.match!)).not.toThrow();
        }
        if (rule.begin) {
          expect(() => new RegExp(rule.begin!)).not.toThrow();
        }
        if (rule.end) {
          expect(() => new RegExp(rule.end!)).not.toThrow();
        }
        if (rule.patterns) {
          testRules(rule.patterns);
        }
      }
    }

    testRules(grammar.patterns);
    for (const repoEntry of Object.values(grammar.repository)) {
      testRules(repoEntry.patterns);
    }
  });

  it('matches all Colt 0.2 keywords and reserved constructs', () => {
    const keywordRules = grammar.repository.keywords.patterns;
    const allKeywordPatterns = keywordRules.map((r) => new RegExp(r.match!));

    const testKeywords = [
      'CONNECT', 'AS', 'DEFAULT', 'CONNECTION',
      'DEFINE', 'COLLECTION', 'STRICT', 'FLEXIBLE',
      'MELD', 'LINK', 'SYNC', 'CONSTRAINT', 'REFERENCES', 'MODE',
      'FIND', 'SELECT', 'WHERE', 'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
      'PUT', 'CREATE', 'DELETE', 'ATOMIC',
      'FETCH', 'LIVE', 'NEAREST', 'SINCE', 'WINDOW',
      'SAGA', 'POLICY', 'EDGE', 'RELATE',
    ];

    for (const kw of testKeywords) {
      const matched = allKeywordPatterns.some((regex) => regex.test(kw));
      expect(matched, `Keyword '${kw}' should be matched by TextMate grammar`).toBe(true);
    }
  });

  it('matches all Colt 0.2 types and annotations', () => {
    const typeRegex = new RegExp(grammar.repository.types.patterns[0].match!);
    const types = ['uuid', 'text', 'int', 'float', 'bool', 'time', 'duration', 'doc', 'list', 'link', 'vector'];
    for (const t of types) {
      expect(typeRegex.test(t), `Type '${t}' should match type grammar`).toBe(true);
    }

    const annotationRegex = new RegExp(grammar.repository.annotations.patterns[0].match!);
    expect(annotationRegex.test('@key')).toBe(true);
    expect(annotationRegex.test('@unique')).toBe(true);
    expect(annotationRegex.test('@default')).toBe(true);
    expect(annotationRegex.test('@backend')).toBe(true);
  });

  it('lexes and parses all fixture files cleanly', () => {
    const fixtures: Array<{ file: string; expectedParseErrors: string[] }> = [
      { file: 'tour.colt', expectedParseErrors: [] },
      { file: 'shebang.colt', expectedParseErrors: [] },
      { file: 'melds.colt', expectedParseErrors: ['COLT2003', 'COLT2003', 'COLT2003'] },
    ];

    for (const { file: fixtureName, expectedParseErrors } of fixtures) {
      const fixturePath = resolve(__dirname, '../editors/vscode/tests/fixtures', fixtureName);
      const content = readFileSync(fixturePath, 'utf-8');

      const lexResult = lex(content);
      expect(lexResult.diagnostics, `Lex diagnostics for ${fixtureName}`).toEqual([]);

      const parseResult = parse(content);
      expect(
        parseResult.diagnostics.map((d) => d.code),
        `Parse diagnostics for ${fixtureName}`,
      ).toEqual(expectedParseErrors);
    }
  });
});
