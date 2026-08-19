import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: false });
const validators = new WeakMap<object, ValidateFunction>();

export interface ToolValidationResult {
  valid: boolean;
  errors: ErrorObject[];
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
