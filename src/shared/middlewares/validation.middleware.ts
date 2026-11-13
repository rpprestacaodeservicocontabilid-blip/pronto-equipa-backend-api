import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Middleware de validação usando Zod
 * Valida o body da requisição contra um schema
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error: any) {
      return res.status(400).json({
        message: 'Validation error',
        errors: error.errors || error.message,
      });
    }
  };
}

/**
 * Middleware de validação para query parameters
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error: any) {
      return res.status(400).json({
        message: 'Query validation error',
        errors: error.errors || error.message,
      });
    }
  };
}

/**
 * Middleware de validação para parâmetros de rota
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error: any) {
      return res.status(400).json({
        message: 'Params validation error',
        errors: error.errors || error.message,
      });
    }
  };
}
