import { AiValidationError } from '../errors/ai-domain.error';

/** Restricted JSON Schema dialect used by the immutable tool catalogue. */
export function validateAiSchema(value: unknown, schema: Record<string, unknown>, path = '$', depth = 0): void {
  if (depth > 12) throw new AiValidationError('Estrutura demasiado profunda.');
  const fail = () => { throw new AiValidationError(`Argumento inválido: ${path}.`); };
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) fail();
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const key of (schema.required ?? []) as string[]) if (!(key in object)) fail();
    for (const [key, entry] of Object.entries(object)) {
      if (['__proto__', 'constructor', 'prototype', 'tenantId', 'actorId', 'companyId', 'userId'].includes(key)) fail();
      if (!Object.prototype.hasOwnProperty.call(properties, key)) { if (schema.additionalProperties === false) fail(); }
      else validateAiSchema(entry, properties[key], `${path}.${key}`, depth + 1);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > Number(schema.maxItems ?? 100)) return fail();
    if (schema.items) for (const item of value) validateAiSchema(item, schema.items as Record<string, unknown>, path, depth + 1);
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > Number(schema.maxLength ?? 8000) || value.length < Number(schema.minLength ?? 0)) return fail();
    if (schema.pattern && !new RegExp(String(schema.pattern)).test(value)) fail();
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || schema.type === 'integer' && !Number.isSafeInteger(value)) return fail();
    if (schema.minimum !== undefined && value < Number(schema.minimum) || schema.maximum !== undefined && value > Number(schema.maximum)) fail();
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail();
}
