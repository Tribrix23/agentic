import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: false });
const validators = new WeakMap<object, ValidateFunction>();

export interface ToolValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

type JsonSchema = Record<string, unknown>;

function parseSchemaValue(value: unknown, schema: JsonSchema | undefined): unknown {
  if (typeof value !== 'string' || !schema || (schema.type !== 'array' && schema.type !== 'object')) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed === null ? value : parsed;
  } catch {
    return value;
  }
}

/** Normalize JSON-valued XML arguments without coercing ordinary string fields. */
export function normalizeToolArguments(schema: Record<string, unknown>, args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;

  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return args;

  const normalized = { ...(args as Record<string, unknown>) };
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (!propertySchema || typeof propertySchema !== 'object' || Array.isArray(propertySchema)) continue;
    normalized[name] = parseSchemaValue(normalized[name], propertySchema as JsonSchema);
  }
  return normalized;
}

export function validateToolArguments(schema: Record<string, unknown>, args: unknown): ToolValidationResult {
  let validate = validators.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validators.set(schema, validate);
  }
  const valid = Boolean(validate(args));
  return { valid, errors: valid ? [] : [...(validate.errors || [])] };
}

export function formatValidationErrors(errors: ErrorObject[]): string {
  return errors.map(error => `${error.instancePath || '/'} ${error.message || 'is invalid'}`).join('; ');
}
