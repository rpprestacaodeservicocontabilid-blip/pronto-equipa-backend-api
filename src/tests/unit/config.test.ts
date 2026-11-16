import {
  createConfig,
  createDatabaseConfig,
  createCorsConfig,
  createLoggerConfig,
  SENSITIVE_FIELDS,
  validateEnv,
} from '../../config';
import { envSchema, parseOrigins } from '../../config/env';

// ============================================================
// MÓDULO 02 — CONFIGURAÇÃO (validação Zod + composição)
// ============================================================
//
// Os ficheiros de configuração NÃO abrem ligações: só derivam
// opções tipadas a partir das variáveis validadas.

/** Ambiente mínimo válido fora de produção. */
function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', JWT_SECRET: 'x', ...overrides };
}

describe('config — esquema de ambiente', () => {
  it('aplica as omissões documentadas', () => {
    const env = envSchema.parse(baseEnv());

    expect(env).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3333,
      HOST: '0.0.0.0',
      SHUTDOWN_TIMEOUT_MS: 10000,
      JWT_EXPIRES_IN: '24h',
      JWT_REFRESH_EXPIRES_IN: '7d',
      DB_DIALECT: 'sqlite',
      DB_STORAGE: './dev.sqlite',
      DB_POOL_MAX: 10,
      DB_SSL: 'false',
      REDIS_PREFIX: 'prontoequipas:',
      QUEUE_CONCURRENCY: 5,
      QUEUE_MAX_RETRIES: 3,
      STORAGE_DRIVER: 'local',
      STORAGE_MAX_FILE_MB: 10,
      LOG_LEVEL: 'info',
      EMAIL_FROM_NAME: 'ProntoEquipas',
      TELEMETRY_ENABLED: 'false',
      TELEMETRY_TRACE_HEADER: 'traceparent',
    });
  });

  it('rejeita porta fora do intervalo', () => {
    expect(() => envSchema.parse(baseEnv({ PORT: '0' }))).toThrow();
    expect(() => envSchema.parse(baseEnv({ PORT: '70000' }))).toThrow();
    expect(() => envSchema.parse(baseEnv({ PORT: 'abc' }))).toThrow();
  });

  it('rejeita segredo JWT vazio e NODE_ENV desconhecido', () => {
    expect(() => envSchema.parse(baseEnv({ JWT_SECRET: '' }))).toThrow(/JWT_SECRET/);
    expect(() => envSchema.parse(baseEnv({ NODE_ENV: 'staging' }))).toThrow();
  });

  it('usa strings enum para booleanos (evita a armadilha do coerce)', () => {
    expect(() => envSchema.parse(baseEnv({ DB_SSL: 'sim' }))).toThrow();
    expect(envSchema.parse(baseEnv({ DB_SSL: 'true' })).DB_SSL).toBe('true');
  });

  it('valida produção: MySQL + credenciais + segredo forte', () => {
    const problems: string[] = [];

    try {
      validateEnv({
        ...baseEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'short',
          DB_DIALECT: 'sqlite',
        }),
      });
    } catch (error) {
      problems.push((error as Error).message);
    }

    expect(problems.join('\n')).toContain('JWT_SECRET');
    expect(problems.join('\n')).toContain('DB_DIALECT must be "mysql"');
  });

  it('produção válida passa com CORS explícito', () => {
    const env = validateEnv(
      baseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-strong-secret-with-at-least-32-characters!',
        DB_DIALECT: 'mysql',
        DB_HOST: 'db',
        DB_PORT: '3306',
        DB_NAME: 'prontoequipas',
        DB_USER: 'app',
        DB_PASSWORD: 'pw',
        PAYMENTS_PII_ENCRYPTION_KEY: 'a1'.repeat(32),
        CORS_ORIGIN: 'https://app.prontoequipas.ao',
      }),
    );

    expect(env.NODE_ENV).toBe('production');
  });

  it('produção com segredo placeholder é rejeitado', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'your-secret-key-here-change-in-production',
          DB_DIALECT: 'mysql',
          DB_HOST: 'db',
          DB_PORT: '3306',
          DB_NAME: 'app',
          DB_USER: 'app',
          DB_PASSWORD: 'pw',
          CORS_ORIGIN: 'https://app.example.com',
        }),
      ),
    ).toThrow(/placeholder/);
  });
});

describe('config — database', () => {
  it('nunca permite sincronização automática do esquema', () => {
    const config = createDatabaseConfig(envSchema.parse(baseEnv({ DB_DIALECT: 'mysql' })));

    expect(config.synchronize).toBe(false);
    expect(config.dialect).toBe('mysql');
  });

  it('em SQLite inclui o storage local; em MySQL, omite', () => {
    const sqlite = createDatabaseConfig(envSchema.parse(baseEnv()));
    const mysql = createDatabaseConfig(
      envSchema.parse(
        baseEnv({
          DB_DIALECT: 'mysql',
          DB_HOST: 'db',
          DB_PORT: '3306',
          DB_NAME: 'app',
          DB_USER: 'app',
          DB_PASSWORD: 'pw',
        }),
      ),
    );

    expect(sqlite.storage).toBe('./dev.sqlite');
    expect('storage' in mysql).toBe(false);
  });

  it('espelha o pool e o SSL validados', () => {
    const config = createDatabaseConfig(
      envSchema.parse(
        baseEnv({
          DB_POOL_MAX: '25',
          DB_POOL_MIN: '2',
          DB_SSL: 'true',
          DB_SSL_REJECT_UNAUTHORIZED: 'false',
        }),
      ),
    );

    expect(config.pool).toMatchObject({ max: 25, min: 2 });
    expect(config.ssl).toEqual({
      enabled: true,
      rejectUnauthorized: false,
    });
  });
});

describe('config — CORS', () => {
  it('fora de produção, sem origens, reflete o pedido', () => {
    const cors = createCorsConfig(envSchema.parse(baseEnv({ FRONTEND_URL: '', CORS_ORIGIN: '' })));

    expect(cors.allowAnyOrigin).toBe(true);
    expect(cors.origins).toEqual([]);
  });

  it('aceita uma lista explícita de origens', () => {
    const cors = createCorsConfig(
      envSchema.parse(
        baseEnv({
          CORS_ORIGIN: 'http://localhost:4200, https://app.prontoequipas.ao',
        }),
      ),
    );

    expect(cors.allowAnyOrigin).toBe(false);
    expect(cors.origins).toEqual(['http://localhost:4200', 'https://app.prontoequipas.ao']);
  });

  it('produção exige origens explícitas (nunca vazio, nunca *)', () => {
    const production = {
      NODE_ENV: 'production' as const,
      FRONTEND_URL: '',
      CORS_ORIGIN: '',
    };

    expect(() => createCorsConfig(production)).toThrow(/required in production/);
    expect(() => createCorsConfig({ ...production, CORS_ORIGIN: '*' })).toThrow(/wildcard/);
  });

  it('produção proíbe origens de loopback', () => {
    expect(() =>
      createCorsConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'http://localhost:4200',
        CORS_ORIGIN: '',
      }),
    ).toThrow(/loopback/);
  });

  it('rejeita origens sem esquema', () => {
    expect(() =>
      createCorsConfig({
        NODE_ENV: 'test',
        FRONTEND_URL: '',
        CORS_ORIGIN: 'app.prontoequipas.ao',
      }),
    ).toThrow(/scheme/);
  });

  it('parseOrigins limpa espaços e entradas vazias', () => {
    expect(parseOrigins(' a ,, b , ')).toEqual(['a', 'b']);
  });
});

describe('config — logger', () => {
  it('normaliza o nível inválido para info', () => {
    const config = createLoggerConfig({
      LOG_LEVEL: 'verbose',
      LOG_DIR: 'logs',
      LOG_MAX_SIZE_MB: 10,
      LOG_MAX_FILES: 5,
    });

    expect(config.level).toBe('info');
  });

  it('converte o tamanho MB para bytes', () => {
    const config = createLoggerConfig({
      LOG_LEVEL: 'info',
      LOG_DIR: 'logs',
      LOG_MAX_SIZE_MB: 2,
      LOG_MAX_FILES: 3,
    });

    expect(config.maxFileSizeBytes).toBe(2 * 1024 * 1024);
    expect(config.maxFiles).toBe(3);
  });

  it('expõe os campos sensíveis para redacção nos logs', () => {
    expect(SENSITIVE_FIELDS).toEqual(
      expect.arrayContaining([
        'password',
        'passwordHash',
        'token',
        'refreshToken',
        'secret',
        'authorization',
        'nif',
      ]),
    );
    // Comparações case-insensitive no logger.
    expect(SENSITIVE_FIELDS.map((field) => field.toLowerCase())).toEqual(
      expect.arrayContaining(['apikey', 'api_key']),
    );
  });
});

describe('config — createConfig', () => {
  it('compõe todos os sub-objetos a partir de um único parse', () => {
    const config = createConfig(baseEnv({ PORT: '4444' }));

    expect(config.app).toMatchObject({ env: 'test', port: 4444 });
    expect(config.auth.jwt.secret).toBe('x');
    expect(config.database.synchronize).toBe(false);
    expect(config.redis.enabled).toBe(false);
    expect(config.queue.enabled).toBe(false);
    expect(config.email.enabled).toBe(false);
    expect(config.storage.driver).toBe('local');
    expect(config.telemetry.enabled).toBe(false);
    expect(config.cors.allowAnyOrigin).toBe(true);
  });

  it('marca Redis/filas como activos quando configurados', () => {
    const config = createConfig(
      baseEnv({
        REDIS_URL: 'redis://localhost:6379',
        RABBITMQ_URL: 'amqp://localhost',
        EMAIL_PROVIDER_URL: 'https://api.mailprovider.test',
        TELEMETRY_ENABLED: 'true',
        TELEMETRY_ENDPOINT: 'http://localhost:4318',
      }),
    );

    expect(config.redis.enabled).toBe(true);
    expect(config.queue.enabled).toBe(true);
    expect(config.email.enabled).toBe(true);
    expect(config.telemetry.enabled).toBe(true);
  });

  it('falha ANTES de criar qualquer configuração com ambiente inválido', () => {
    expect(() => createConfig({ NODE_ENV: 'test' })).toThrow(/\[config\] invalid environment/);
  });

  it('telemetria fica desligada sem endpoint, mesmo activada', () => {
    const config = createConfig(baseEnv({ TELEMETRY_ENABLED: 'true', TELEMETRY_ENDPOINT: '' }));

    expect(config.telemetry.enabled).toBe(false);
  });
});
