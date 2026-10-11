import type {
  Annotation,
  CreateStatement,
  DefineCollectionStatement,
  DeleteStatement,
  Expression,
  FieldDefinition,
  FieldPath,
  FindStatement,
  ObjectField,
  PutStatement,
  Statement,
  TypeDefinition,
} from '@coltanedb/parser';
import type { CollectionModel, ParameterBinding, PlanStep } from './types.ts';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function parameter(binding: ParameterBinding, params: ParameterBinding[]): string {
  params.push(binding);
  return `$${params.length}`;
}

function getAnnotation(field: FieldDefinition | undefined, name: string): Annotation | undefined {
  return field?.annotations?.find((annotation) => annotation.name === name);
}

function keyField(model: CollectionModel): FieldDefinition {
  return model.statement.fields.find((field) => getAnnotation(field, 'key')) ?? model.statement.fields[0] ?? {
    name: 'id',
    valueType: { kind: 'scalar', name: 'uuid' },
    annotations: [],
    span: model.statement.span,
  };
}

function pgType(valueType: TypeDefinition, model?: CollectionModel): string {
  if (valueType.kind === 'vector') return `vector(${valueType.dimension})`;
  if (valueType.kind === 'list' && valueType.itemType) return `${pgType(valueType.itemType, model)}[]`;
  if (valueType.kind === 'link') {
    const target = model?.name === valueType.name ? model : undefined;
    return target ? pgType(keyField(target).valueType, target) : 'uuid';
  }
  switch (valueType.name) {
    case 'uuid': return 'uuid';
    case 'text': return 'text';
    case 'int': return 'integer';
    case 'float': return 'double precision';
    case 'bool': return 'boolean';
    case 'time': return 'timestamptz';
    case 'duration': return 'interval';
    case 'doc': return 'jsonb';
    default: return 'text';
  }
}

function compileSchema(statement: DefineCollectionStatement, model: CollectionModel): PlanStep {
  const columns = statement.fields.map((field) => {
    const nullable = field.optional ? '' : ' NOT NULL';
    const unique = getAnnotation(field, 'unique') ? ' UNIQUE' : '';
    return `${quoteIdentifier(field.name)} ${pgType(field.valueType, model)}${nullable}${unique}`;
  });
  const primaryKey = keyField(model);
  columns.push(`PRIMARY KEY (${quoteIdentifier(primaryKey.name)})`);
  return {
    backend: model.backend,
    operation: 'schema.create',
    collection: model.name,
    parameterizedStatement: `CREATE TABLE ${quoteIdentifier(model.name)} (${columns.join(', ')})`,
    params: [],
    span: statement.span,
  };
}

function compileFieldPath(path: FieldPath, _model: CollectionModel, params: ParameterBinding[]): string {
  const column = quoteIdentifier(path.root);
  if (path.segments.length === 0) return column;
  const pathSegments = path.segments.map(String);
  const marker = parameter({ kind: 'path', value: pathSegments }, params);
  return `jsonb_extract_path(${column}, VARIADIC ${marker}::text[])`;
}

function jsonValue(expression: Expression): unknown {
  if (expression.type === 'Literal') return expression.value;
  if (expression.type === 'NumberLiteral') return Number(expression.raw);
  if (expression.type === 'Unary' && expression.operator === '-') {
    const operand = jsonValue(expression.operand);
    return typeof operand === 'number' ? -operand : undefined;
  }
  if (expression.type === 'DurationLiteral' || expression.type === 'TimeLiteral') return expression.raw;
  if (expression.type === 'ObjectLiteral') {
    return Object.fromEntries(expression.fields.map((field) => [field.name, jsonValue(field.value)]));
  }
  if (expression.type === 'ListLiteral') return expression.items.map(jsonValue);
  return undefined;
}

function knownType(expression: Expression, model: CollectionModel): string | undefined {
  if (expression.type === 'NumberLiteral') return expression.kind === 'integer' ? 'int' : 'float';
  if (expression.type === 'Literal') return expression.kind;
  if (expression.type === 'DurationLiteral') return 'duration';
  if (expression.type === 'TimeLiteral') return 'time';
  if (expression.type === 'FieldPath') {
    const field = model.statement.fields.find((candidate) => candidate.name === expression.root);
    return expression.segments.length === 0 ? field?.valueType.name : undefined;
  }
  return undefined;
}

function compileExpression(expression: Expression, model: CollectionModel, params: ParameterBinding[]): string {
  switch (expression.type) {
    case 'Literal':
      return `${parameter({ kind: 'constant', value: expression.value }, params)}`;
    case 'NumberLiteral':
      return `${parameter({ kind: 'constant', value: Number(expression.raw) }, params)}`;
    case 'DurationLiteral':
    case 'TimeLiteral':
      return `${parameter({ kind: 'constant', value: expression.raw }, params)}`;
    case 'Parameter':
      return `${parameter({ kind: 'parameter', name: expression.name }, params)}`;
    case 'FieldPath':
      return compileFieldPath(expression, model, params);
    case 'RecordReference':
      return `${parameter({ kind: 'constant', value: `${expression.id.collection}:${expression.id.key}` }, params)}`;
    case 'Call':
      if (expression.name.toUpperCase() === 'NOW' && expression.args.length === 0) {
        return `${parameter({ kind: 'default', expression: 'now' }, params)}`;
      }
      throw new Error(`Unsupported function reached code generation: ${expression.name}`);
    case 'Unary':
      return expression.operator === 'NOT'
        ? `(NOT ${compileExpression(expression.operand, model, params)})`
        : `(-${compileExpression(expression.operand, model, params)})`;
    case 'Binary': {
      if (['==', '!=', '<', '<=', '>', '>='].includes(expression.operator)) {
        const leftType = knownType(expression.left, model);
        const rightType = knownType(expression.right, model);
        const numeric = new Set(['int', 'float']);
        const incompatible =
          (leftType === 'string' && numeric.has(rightType ?? '')) ||
          (rightType === 'string' && numeric.has(leftType ?? ''));
        if (incompatible) return 'FALSE';
      }
      const left = compileExpression(expression.left, model, params);
      const right = compileExpression(expression.right, model, params);
      if (expression.operator === '==') return `(${left} IS NOT DISTINCT FROM ${right})`;
      if (expression.operator === '!=') return `(${left} IS DISTINCT FROM ${right})`;
      const operators: Record<string, string> = {
        '<': '<', '<=': '<=', '>': '>', '>=': '>=', '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
        AND: 'AND', OR: 'OR', IN: '= ANY',
      };
      const operator = operators[expression.operator];
      if (!operator) throw new Error(`Unsupported operator reached code generation: ${expression.operator}`);
      if (expression.operator === 'IN') return `(${left} = ANY(${right}))`;
      const comparison = ['<', '<=', '>', '>='].includes(expression.operator);
      const sql = `(${left} ${operator} ${right})`;
      return comparison ? `COALESCE(${sql}, FALSE)` : sql;
    }
    case 'ObjectLiteral':
    case 'ListLiteral': {
      const marker = parameter({ kind: 'constant', value: JSON.stringify(jsonValue(expression)), transform: 'json' }, params);
      return `${marker}::jsonb`;
    }
    case 'NamedArgument':
      throw new Error('Named annotation argument cannot be generated as a query expression.');
  }
}

function compileFind(statement: FindStatement, model: CollectionModel): PlanStep {
  const params: ParameterBinding[] = [];
  const projection = statement.projection
    .map((field) => `${compileFieldPath(field, model, params)} AS ${quoteIdentifier(field.segments.length ? `${field.root}.${field.segments.join('.')}` : field.root)}`)
    .join(', ');
  let sql = `SELECT ${projection} FROM ${quoteIdentifier(model.name)}`;
  if (statement.where) sql += ` WHERE ${compileExpression(statement.where, model, params)}`;
  if (statement.orderBy) {
    sql += ` ORDER BY ${compileFieldPath(statement.orderBy.field, model, params)} ${statement.orderBy.direction} NULLS LAST`;
  }
  if (statement.limit !== undefined) sql += ` LIMIT ${parameter({ kind: 'constant', value: statement.limit }, params)}`;
  if (statement.offset !== undefined) sql += ` OFFSET ${parameter({ kind: 'constant', value: statement.offset }, params)}`;
  return { backend: model.backend, operation: 'query', collection: model.name, parameterizedStatement: sql, params, span: statement.span };
}

function compileInsert(
  statement: PutStatement | CreateStatement,
  model: CollectionModel,
  mode: 'put' | 'create',
): PlanStep {
  const params: ParameterBinding[] = [];
  const primary = keyField(model);
  const supplied = new Map(statement.fields.map((field) => [field.name, field]));
  const values: ObjectField[] = [...statement.fields];
  if (statement.type === 'Put' || statement.id) {
    const id = statement.type === 'Put' ? statement.id : statement.id!;
    if (!supplied.has(primary.name)) {
      values.unshift({
        name: primary.name,
        value: { type: 'Literal', kind: 'key', value: id.key, raw: id.key, span: id.span },
        span: id.span,
      });
    }
  } else if (!supplied.has(primary.name)) {
    values.unshift({
      name: primary.name,
      value: { type: 'Call', name: 'gen_random_uuid', args: [], span: statement.span },
      span: statement.span,
    });
  }

  for (const field of model.statement.fields) {
    if (supplied.has(field.name) || values.some((value) => value.name === field.name)) continue;
    const defaultAnnotation = getAnnotation(field, 'default');
    if (!defaultAnnotation) continue;
    const defaultValue = defaultAnnotation.args[0];
    if (defaultValue) values.push({ name: field.name, value: defaultValue, span: defaultAnnotation.span });
  }
  if (mode === 'put') {
    for (const field of model.statement.fields) {
      if (field.optional && !values.some((value) => value.name === field.name)) {
        values.push({
          name: field.name,
          value: { type: 'Literal', kind: 'null', value: null, raw: 'NULL', span: statement.span },
          span: statement.span,
        });
      }
    }
  }

  const names = values.map((field) => quoteIdentifier(field.name));
  const placeholders = values.map((field) => {
    if (field.value.type === 'Call' && field.value.name === 'gen_random_uuid') return 'gen_random_uuid()';
    const definition = model.statement.fields.find((candidate) => candidate.name === field.name);
    if (definition?.valueType.kind === 'list' && field.value.type === 'ListLiteral') {
      return parameter({ kind: 'constant', value: jsonValue(field.value), transform: 'array' }, params);
    }
    if (definition?.valueType.kind === 'vector' && field.value.type === 'ListLiteral') {
      const values = field.value.items.map(jsonValue);
      const vector = `[${values.join(',')}]`;
      const marker = parameter({ kind: 'constant', value: vector, transform: 'vector' }, params);
      return `${marker}::vector(${definition.valueType.dimension})`;
    }
    if (definition?.valueType.kind === 'primitive' && definition.valueType.name === 'doc' && field.value.type === 'ObjectLiteral') {
      const marker = parameter({ kind: 'constant', value: JSON.stringify(jsonValue(field.value)), transform: 'json' }, params);
      return `${marker}::jsonb`;
    }
    return compileExpression(field.value, model, params);
  });
  let sql = `INSERT INTO ${quoteIdentifier(model.name)} (${names.join(', ')}) VALUES (${placeholders.join(', ')})`;
  if (mode === 'put') {
    const updates = values
      .filter((field) => field.name !== primary.name && !getAnnotation(model.statement.fields.find((candidate) => candidate.name === field.name), 'readonly'))
      .map((field) => `${quoteIdentifier(field.name)} = EXCLUDED.${quoteIdentifier(field.name)}`);
    const readonlyChecks = values
      .filter((field) => field.name !== primary.name && supplied.has(field.name) && getAnnotation(model.statement.fields.find((candidate) => candidate.name === field.name), 'readonly'))
      .map((field) => `${quoteIdentifier(model.name)}.${quoteIdentifier(field.name)} IS NOT DISTINCT FROM EXCLUDED.${quoteIdentifier(field.name)}`);
    sql += updates.length > 0
      ? ` ON CONFLICT (${quoteIdentifier(primary.name)}) DO UPDATE SET ${updates.join(', ')}${readonlyChecks.length ? ` WHERE ${readonlyChecks.join(' AND ')}` : ''}`
      : readonlyChecks.length > 0
        ? ` ON CONFLICT (${quoteIdentifier(primary.name)}) DO UPDATE SET ${quoteIdentifier(primary.name)} = EXCLUDED.${quoteIdentifier(primary.name)} WHERE ${readonlyChecks.join(' AND ')}`
        : ` ON CONFLICT (${quoteIdentifier(primary.name)}) DO NOTHING`;
  } else {
    sql += ` ON CONFLICT (${quoteIdentifier(primary.name)}) DO NOTHING`;
  }
  sql += ` RETURNING *`;
  return {
    backend: model.backend,
    operation: mode === 'put' ? 'record.put' : 'record.create',
    collection: model.name,
    parameterizedStatement: sql,
    params,
    span: statement.span,
  };
}

function compileDelete(statement: DeleteStatement, model: CollectionModel): PlanStep {
  const params: ParameterBinding[] = [];
  const primary = keyField(model);
  let sql = `DELETE FROM ${quoteIdentifier(model.name)}`;
  if (statement.target.kind === 'record') {
    sql += ` WHERE ${quoteIdentifier(primary.name)} = ${parameter({ kind: 'constant', value: statement.target.id.key }, params)}`;
  } else {
    sql += ` WHERE ${compileExpression(statement.target.expression, model, params)}`;
  }
  sql += ' RETURNING 1';
  return { backend: model.backend, operation: 'record.delete', collection: model.name, parameterizedStatement: sql, params, span: statement.span };
}

export function generateStatement(statement: Statement, model: CollectionModel): PlanStep {
  if (statement.type === 'DefineCollection') return compileSchema(statement, model);
  if (statement.type === 'Find') return compileFind(statement, model);
  if (statement.type === 'Put') return compileInsert(statement, model, 'put');
  if (statement.type === 'Create') return compileInsert(statement, model, 'create');
  if (statement.type === 'Delete') return compileDelete(statement, model);
  if (statement.type === 'Atomic') {
    const substeps = statement.statements.map((inner: Statement) => generateStatement(inner, model));
    return { backend: model.backend, operation: 'transaction', collection: model.name, substeps, span: statement.span };
  }
  return { backend: model.backend, operation: 'transaction', collection: model.name, span: statement.span };
}

export function backendFor(statement: DefineCollectionStatement): string | undefined {
  const annotation = statement.annotations.find((item) => item.name === 'backend');
  if (!annotation) return undefined;
  const value = annotation.args[0];
  if (value?.type === 'FieldPath') return value.root;
  return undefined;
}

export function annotationName(field: FieldDefinition, name: string): boolean {
  return field.annotations.some((annotation) => annotation.name === name);
}
