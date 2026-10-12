/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: 'colt',

  extras: $ => [
    /\s/,
    $.comment,
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => repeat($._statement),

    _statement: $ => choice(
      $.pragma_statement,
      $.connection_statement,
      $.default_connection_statement,
      $.collection_statement,
      $.meld_statement,
      $.find_statement,
      $.put_statement,
      $.create_statement,
      $.delete_statement,
      $.atomic_statement,
    ),

    pragma_statement: $ => seq(
      '#colt',
      field('version', $.version_literal),
    ),

    connection_statement: $ => seq(
      caseInsensitive('CONNECT'),
      field('alias', $.identifier),
      caseInsensitive('AS'),
      field('engine', $.engine_name),
      optional(seq('(', field('url', $._expression), ')')),
    ),

    default_connection_statement: $ => seq(
      caseInsensitive('DEFAULT'),
      caseInsensitive('CONNECTION'),
      field('alias', $.identifier),
    ),

    engine_name: $ => choice(
      caseInsensitive('postgres'),
      caseInsensitive('postgresql'),
      caseInsensitive('redis'),
      caseInsensitive('mongodb'),
      caseInsensitive('sqlite'),
      caseInsensitive('libsql'),
      caseInsensitive('firestore'),
      caseInsensitive('d1'),
    ),

    collection_statement: $ => seq(
      caseInsensitive('DEFINE'),
      caseInsensitive('COLLECTION'),
      field('name', $.identifier),
      optional(field('mode', choice(caseInsensitive('STRICT'), caseInsensitive('FLEXIBLE')))),
      repeat($.annotation),
      '{',
      repeat(choice(
        $.field_definition,
        $.mask_statement,
        $.redact_statement,
        $.expire_statement,
        $.fallback_statement,
      )),
      '}',
    ),

    mask_statement: $ => seq(
      caseInsensitive('MASK'),
      field('field', $.identifier),
      caseInsensitive('WITH'),
      field('pattern', choice($.string_literal, $._expression)),
      caseInsensitive('FOR'),
      caseInsensitive('ROLE'),
      field('role', choice($.string_literal, $.identifier)),
    ),

    redact_statement: $ => seq(
      caseInsensitive('REDACT'),
      field('field', $.identifier),
      caseInsensitive('FOR'),
      caseInsensitive('ROLE'),
      field('role', choice($.string_literal, $.identifier)),
    ),

    expire_statement: $ => seq(
      caseInsensitive('EXPIRE'),
      caseInsensitive('AFTER'),
      field('duration', $.duration_literal),
      optional(seq(caseInsensitive('CASCADE'), caseInsensitive('TO'), caseInsensitive('ALL'))),
    ),

    fallback_statement: $ => seq(
      caseInsensitive('FETCH'),
      caseInsensitive('FROM'),
      field('primary', $.path_expression),
      caseInsensitive('WITH'),
      caseInsensitive('FALLBACK'),
      caseInsensitive('TO'),
      field('fallback', $.path_expression),
      optional(seq(caseInsensitive('TIMEOUT'), field('timeout', $.duration_literal))),
    ),

    meld_statement: $ => seq(
      caseInsensitive('DEFINE'),
      caseInsensitive('MELD'),
      field('name', $.identifier),
      '{',
      repeat($._meld_clause),
      '}',
    ),

    _meld_clause: $ => choice(
      $.meld_link,
      $.meld_sync,
      $.meld_constraint,
      $.meld_vectorize,
      $.meld_stream,
      $.meld_resolve,
    ),

    meld_vectorize: $ => seq(
      caseInsensitive('VECTORIZE'),
      caseInsensitive('USING'),
      field('model', $.string_literal),
    ),

    meld_stream: $ => seq(
      choice(
        seq(
          caseInsensitive('STREAM'),
          field('source', $.path_expression),
          caseInsensitive('TO'),
          field('target', $.path_expression),
        ),
        seq(
          caseInsensitive('ON'),
          choice(
            seq(caseInsensitive('INSERT'), caseInsensitive('TO'), field('on_insert', $.path_expression)),
            seq(caseInsensitive('UPDATE'), caseInsensitive('TO'), field('on_update', $.path_expression)),
            seq(caseInsensitive('DELETE'), caseInsensitive('TO'), field('on_delete', $.path_expression)),
          ),
          caseInsensitive('STREAM'),
          caseInsensitive('TO'),
          field('target', $.path_expression),
        ),
      ),
    ),

    meld_resolve: $ => seq(
      caseInsensitive('ON'),
      caseInsensitive('CONFLICT'),
      caseInsensitive('RESOLVE'),
      field('strategy', $.identifier),
    ),

    meld_link: $ => seq(
      caseInsensitive('LINK'),
      $.identifier,
      caseInsensitive('TO'),
      $.path_expression,
    ),

    meld_sync: $ => seq(
      caseInsensitive('SYNC'),
      $.path_expression,
      caseInsensitive('TO'),
      $.path_expression,
    ),

    meld_constraint: $ => seq(
      caseInsensitive('CONSTRAINT'),
      $.identifier,
      $._expression,
    ),

    field_definition: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type_expression),
      repeat($.annotation),
      optional(','),
    ),

    _type_expression: $ => choice(
      $.primitive_type,
      $.link_type,
      $.list_type,
      $.vector_type,
      $.optional_type,
    ),

    primitive_type: $ => choice(
      caseInsensitive('text'),
      caseInsensitive('string'),
      caseInsensitive('int'),
      caseInsensitive('integer'),
      caseInsensitive('float'),
      caseInsensitive('bool'),
      caseInsensitive('boolean'),
      caseInsensitive('uuid'),
      caseInsensitive('time'),
      caseInsensitive('timestamp'),
      caseInsensitive('doc'),
      caseInsensitive('json'),
    ),

    link_type: $ => seq(
      caseInsensitive('link'),
      '<',
      field('target', $.identifier),
      '>',
    ),

    list_type: $ => seq(
      caseInsensitive('list'),
      '<',
      field('element', $._type_expression),
      '>',
    ),

    vector_type: $ => seq(
      caseInsensitive('vector'),
      '(',
      field('dimension', $.integer_literal),
      ')',
    ),

    optional_type: $ => seq(
      $._type_expression,
      '?',
    ),

    annotation: $ => seq(
      '@',
      field('name', $.identifier),
      optional(seq('(', optional($._annotation_arguments), ')')),
    ),

    _annotation_arguments: $ => commaSeparated($._expression),

    find_statement: $ => seq(
      caseInsensitive('FIND'),
      field('collection', $.identifier),
      optional(seq(caseInsensitive('SELECT'), field('projection', $.projection_list))),
      optional(seq(caseInsensitive('WHERE'), field('filter', $._expression))),
      optional(seq(caseInsensitive('ORDER'), caseInsensitive('BY'), field('order', $.order_by_clause))),
      optional(seq(caseInsensitive('LIMIT'), field('limit', $._expression))),
      optional(seq(caseInsensitive('OFFSET'), field('offset', $._expression))),
    ),

    projection_list: $ => commaSeparated1($.projection_item),

    projection_item: $ => seq(
      field('expr', $._expression),
      optional(seq(caseInsensitive('AS'), field('alias', $.identifier))),
    ),

    order_by_clause: $ => commaSeparated1(seq(
      $._expression,
      optional(choice(caseInsensitive('ASC'), caseInsensitive('DESC'))),
      optional(choice(
        seq(caseInsensitive('NULLS'), caseInsensitive('FIRST')),
        seq(caseInsensitive('NULLS'), caseInsensitive('LAST')),
      )),
    )),

    put_statement: $ => seq(
      caseInsensitive('PUT'),
      field('collection', $.identifier),
      optional(seq(':', field('id', choice($.uuid_literal, $.string_literal, $.identifier)))),
      field('record', $.object_literal),
    ),

    create_statement: $ => seq(
      caseInsensitive('CREATE'),
      field('collection', $.identifier),
      field('record', $.object_literal),
    ),

    delete_statement: $ => seq(
      caseInsensitive('DELETE'),
      field('collection', $.identifier),
      choice(
        seq(':', field('id', choice($.uuid_literal, $.string_literal, $.identifier))),
        seq(caseInsensitive('WHERE'), field('filter', $._expression)),
      ),
    ),

    atomic_statement: $ => seq(
      caseInsensitive('ATOMIC'),
      '{',
      repeat(seq($._atomic_operation, optional(';'))),
      '}',
    ),

    _atomic_operation: $ => choice(
      $.put_statement,
      $.create_statement,
      $.delete_statement,
    ),

    _expression: $ => choice(
      $.binary_expression,
      $.unary_expression,
      $.call_expression,
      $.path_expression,
      $.primary_expression,
    ),

    binary_expression: $ => choice(
      prec.left(1, seq($._expression, caseInsensitive('OR'), $._expression)),
      prec.left(2, seq($._expression, caseInsensitive('AND'), $._expression)),
      prec.left(3, seq($._expression, choice('==', '!=', '=', '<', '<=', '>', '>='), $._expression)),
      prec.left(4, seq($._expression, choice('+', '-'), $._expression)),
      prec.left(5, seq($._expression, choice('*', '/', '%'), $._expression)),
    ),

    unary_expression: $ => prec(6, seq(
      choice(caseInsensitive('NOT'), '!', '-'),
      $._expression,
    )),

    call_expression: $ => prec(7, seq(
      field('function', $.identifier),
      '(',
      optional(commaSeparated($._expression)),
      ')',
    )),

    path_expression: $ => prec(8, seq(
      $.identifier,
      repeat1(seq('.', $.identifier)),
    )),

    primary_expression: $ => choice(
      $.identifier,
      $.parameter,
      $.string_literal,
      $.integer_literal,
      $.float_literal,
      $.boolean_literal,
      $.null_literal,
      $.duration_literal,
      $.time_literal,
      $.uuid_literal,
      $.array_literal,
      $.object_literal,
      seq('(', $._expression, ')'),
    ),

    parameter: $ => seq('$', $.identifier),

    object_literal: $ => seq(
      '{',
      optional(commaSeparated($.object_field)),
      '}',
    ),

    object_field: $ => seq(
      field('key', choice($.identifier, $.string_literal)),
      ':',
      field('value', $._expression),
    ),

    array_literal: $ => seq(
      '[',
      optional(commaSeparated($._expression)),
      ']',
    ),

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    string_literal: $ => /"([^"\\]|\\.)*"/,

    integer_literal: $ => /-?[0-9]+/,

    float_literal: $ => /-?[0-9]+\.[0-9]+/,

    boolean_literal: $ => choice(
      caseInsensitive('TRUE'),
      caseInsensitive('FALSE'),
    ),

    null_literal: $ => caseInsensitive('NULL'),

    version_literal: $ => /[0-9]+(\.[0-9]+)?/,

    duration_literal: $ => /[0-9]+[smhdSMHD]/,

    time_literal: $ => /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?/,

    uuid_literal: $ => /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,

    comment: $ => choice(
      seq('--', /.*/),
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
    ),
  },
});

function commaSeparated1(rule) {
  return seq(rule, repeat(seq(',', rule)), optional(','));
}

function commaSeparated(rule) {
  return optional(commaSeparated1(rule));
}

function caseInsensitive(keyword) {
  return new RegExp(
    keyword
      .split('')
      .map(letter => `[${letter.toLowerCase()}${letter.toUpperCase()}]`)
      .join('')
  );
}
