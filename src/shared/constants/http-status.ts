/**
 * HTTP Status Codes
 * Constantes para status codes HTTP usadas na API
 */

export const HTTP_STATUS = {
  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 4xx Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx Server Errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const HTTP_MESSAGES = {
  OK: 'Success',
  CREATED: 'Resource created successfully',
  ACCEPTED: 'Request accepted',
  NO_CONTENT: 'No content',
  BAD_REQUEST: 'Invalid request',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource already exists',
  UNPROCESSABLE_ENTITY: 'Validation error',
  TOO_MANY_REQUESTS: 'Too many requests',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  NOT_IMPLEMENTED: 'Not implemented',
  SERVICE_UNAVAILABLE: 'Service unavailable',
} as const;
