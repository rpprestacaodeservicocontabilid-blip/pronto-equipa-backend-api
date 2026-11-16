/**
 * Error Middleware
 * Middleware para tratamento centralizado de erros
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ForeignKeyConstraintError, UniqueConstraintError } from 'sequelize';
import { logger } from '../../config/logger';
import { AppError } from '../errors/app.error';

export function errorMiddleware(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Log do erro
  logger.error(`[${req.method}] ${req.path} - ${error.name || 'Error'}`, error);

  // Se for um AppError customizado
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Erro 400 - Syntax errors do JSON
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid JSON',
        code: 'INVALID_JSON',
        statusCode: 400,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Erro 400 - validação Zod (ex.: schema.parse no controller)
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        issues: error.issues,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Erro 409 - violação de constraint única (ex.: registo duplicado)
  if (error instanceof UniqueConstraintError) {
    return res.status(409).json({
      success: false,
      error: {
        message: 'Resource already exists',
        code: 'CONFLICT',
        statusCode: 409,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Erro 400 - violação de chave estrangeira (ex.: fieldId/cityId/userId inexistente)
  if (error instanceof ForeignKeyConstraintError) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid reference: the related record does not exist',
        code: 'FOREIGN_KEY_VIOLATION',
        statusCode: 400,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Fallback para erros de domínio legados (plain Error).
  // Mapeia mensagens convencionais para o status HTTP correto.
  if (error instanceof Error) {
    const message = error.message || '';

    if (/not found\.?$/i.test(message)) {
      return res.status(404).json({
        success: false,
        error: {
          message,
          code: 'NOT_FOUND',
          statusCode: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (/already exists\.?$/i.test(message)) {
      return res.status(409).json({
        success: false,
        error: {
          message,
          code: 'CONFLICT',
          statusCode: 409,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (
      /is required\.?$/i.test(message) ||
      /\bmust be\b/i.test(message) ||
      /^invalid\b/i.test(message)
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message,
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // Erro genérico
  return res.status(500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
      timestamp: new Date().toISOString(),
    },
  });
}
