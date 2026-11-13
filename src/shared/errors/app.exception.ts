export abstract class AppException extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class DomainException extends AppException {
  constructor(message: string, code: string = 'DOMAIN_ERROR') {
    super(code, message, 400);
  }
}

export class NotFoundException extends AppException {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with id ${identifier} not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404);
  }
}

export class ValidationException extends AppException {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class ConflictException extends AppException {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class InternalServerException extends AppException {
  constructor(message: string = 'Internal server error') {
    super('INTERNAL_SERVER_ERROR', message, 500);
  }
}
