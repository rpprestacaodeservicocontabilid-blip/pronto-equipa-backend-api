/**
 * Erros de domínio do assistente.
 *
 * O domínio não conhece HTTP: os códigos são traduzidos para
 * `statusCode` pela camada de apresentação (`ai-error.mapper`).
 */
export type AiDomainErrorCode =
  | 'AI_VALIDATION_ERROR'
  | 'AI_NOT_FOUND'
  | 'AI_CONFLICT'
  | 'AI_FORBIDDEN'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_SAFETY_BLOCKED'
  | 'AI_INVALID_TRANSITION'
  | 'AI_TOOL_UNAVAILABLE'
  | 'AI_APPROVAL_REQUIRED'
  | 'AI_ARGUMENTS_MISMATCH'
  | 'AI_PROVIDER_UNAVAILABLE';

export class AiDomainError extends Error {
  readonly code: AiDomainErrorCode;

  constructor(message: string, code: AiDomainErrorCode = 'AI_VALIDATION_ERROR') {
    super(message);
    this.name = 'AiDomainError';
    this.code = code;
  }
}

export class AiValidationError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_VALIDATION_ERROR');
    this.name = 'AiValidationError';
  }
}

export class AiNotFoundError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_NOT_FOUND');
    this.name = 'AiNotFoundError';
  }
}

export class AiForbiddenError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_FORBIDDEN');
    this.name = 'AiForbiddenError';
  }
}

export class AiQuotaExceededError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_QUOTA_EXCEEDED');
    this.name = 'AiQuotaExceededError';
  }
}

export class AiSafetyBlockedError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_SAFETY_BLOCKED');
    this.name = 'AiSafetyBlockedError';
  }
}

export class AiInvalidTransitionError extends AiDomainError {
  constructor(from: string, to: string) {
    super(`Transição inválida: ${from} → ${to}.`, 'AI_INVALID_TRANSITION');
    this.name = 'AiInvalidTransitionError';
  }
}

export class AiToolUnavailableError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_TOOL_UNAVAILABLE');
    this.name = 'AiToolUnavailableError';
  }
}

export class AiApprovalRequiredError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_APPROVAL_REQUIRED');
    this.name = 'AiApprovalRequiredError';
  }
}

export class AiArgumentsMismatchError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_ARGUMENTS_MISMATCH');
    this.name = 'AiArgumentsMismatchError';
  }
}

export class AiProviderUnavailableError extends AiDomainError {
  constructor(message: string) {
    super(message, 'AI_PROVIDER_UNAVAILABLE');
    this.name = 'AiProviderUnavailableError';
  }
}
