/**
 * Configurações de Segurança Recomendadas
 * Use este arquivo para centralizar todas as configurações de segurança
 */

export const securityConfig = {
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    algorithm: 'HS256' as const,
  },

  // Rate Limiting
  rateLimiting: {
    enabled: process.env.NODE_ENV === 'production',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutos
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxAttempts: 5, // 5 tentativas
    },
  },

  // CORS
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3333',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },

  // Helmet
  helmet: {
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000, // 1 ano
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: 'no-referrer' },
    xssFilter: true,
  },

  // Validação de Input
  validation: {
    maxBodySize: '10mb',
    maxUrlSize: '5mb',
    allowedContentTypes: ['application/json', 'application/x-www-form-urlencoded'],
  },

  // Autenticação
  authentication: {
    passwordMinLength: 8,
    tokenRefreshTime: '7d',
    sessionTimeout: '24h',
  },

  // DB
  database: {
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000'),
    },
  },

  // Logs
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    mask_sensitive_data: true,
    masked_fields: ['password', 'token', 'secret', 'JWT_SECRET', 'api_key'],
  },
};

/**
 * Validação de configuração de segurança em startup
 */
export function validateSecurityConfig(): void {
  const errors: string[] = [];

  // Validar JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'secret') {
      errors.push('⚠️  JWT_SECRET não definido ou é o valor padrão em produção');
    }

    if (!process.env.FRONTEND_URL) {
      errors.push('⚠️  FRONTEND_URL não definido para CORS em produção');
    }

    if (!process.env.DATABASE_URL) {
      errors.push('⚠️  DATABASE_URL não definido em produção');
    }
  }

  if (errors.length > 0) {
    console.warn('\n🔒 VERIFICAÇÃO DE SEGURANÇA:\n');
    errors.forEach((error) => console.warn(error));
    console.warn('\n');
  }
}

export default securityConfig;
