import request from 'supertest';
import { get as httpGet, createServer } from 'http';
import type { AddressInfo } from 'net';
import type { Express } from 'express';

// ============================================================
// BOOTSTRAP — testes de integração (BOOT-001..010)
// ============================================================
//
// Os testes unitários do container e do ciclo de vida vivem em
// `src/tests/unit/bootstrap-*.test.ts`.

import { createApp, createApplicationContext } from '../../bootstrap/app';
import { HealthRegistry } from '../../bootstrap/health';
import { Lifecycle } from '../../bootstrap/lifecycle';
import { HttpError } from '../../bootstrap/register-error-handlers';
import { initializeModules, shutdownModules } from '../../bootstrap/register-modules';
import { closeHttpServer, createShutdownHandler, ShutdownError } from '../../bootstrap/shutdown';
import { loadEnvironment, validateEnvironment } from '../../bootstrap/validate-environment';

import type {
  ApplicationContext,
  Logger,
  ModuleDefinition,
} from '../../bootstrap/types/application-context';

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  http() {},
};

function testConfig() {
  return {
    nodeEnv: 'test' as const,
    port: 3333,
    host: '127.0.0.1',
    jwtSecret: 'secret',
    shutdownTimeoutMs: 10000,
  };
}

function createContext(): ApplicationContext {
  return createApplicationContext({
    config: testConfig(),
    logger: silentLogger,
  });
}

function get(port: number, path = '/health'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpGet({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });

    req.on('error', reject);
  });
}

async function listenEphemeral(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  return (server.address() as AddressInfo).port;
}

// ============================================================
// 1. CRIAÇÃO DO APP (BOOT-001 / BOOT-005)
// ============================================================

describe('bootstrap — createApp', () => {
  let context: ApplicationContext;
  let lifecycle: Lifecycle;
  let health: HealthRegistry;
  let app: Express;

  beforeEach(() => {
    lifecycle = new Lifecycle();
    health = new HealthRegistry();
    context = createApplicationContext({
      config: testConfig(),
      lifecycle,
      health,
      logger: silentLogger,
    });
    app = createApp({ context });
  });

  // BOOT-001 — testes HTTP sem abrir uma porta de rede.
  it('serve pedidos HTTP sem escutar numa porta', async () => {
    await request(app).get('/health').expect(200);
  });

  it('expõe os serviços base no contentor (BOOT-002)', () => {
    expect(context.container.has('app.lifecycle')).toBe(true);
    expect(context.container.has('app.health')).toBe(true);
    expect(context.container.resolve<Lifecycle>('app.lifecycle')).toBe(lifecycle);
    expect(context.container.resolve<HealthRegistry>('app.health')).toBe(health);
    expect(context.container.resolve('app.config')).toEqual(testConfig());
  });

  // --------------------------------------------------------
  // BOOT-009 — liveness e readiness com papéis distintos
  // --------------------------------------------------------

  it('devolve liveness em GET /health/live — sempre 200', async () => {
    const response = await request(app).get('/health/live').expect(200);

    expect(response.body).toMatchObject({
      status: 'alive',
      env: 'test',
      state: 'created',
    });
    expect(response.body.timestamp).toBeDefined();
  });

  it('mantém o alias legacy GET /health', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', state: 'created' });
  });

  it('readiness responde 503 antes de a aplicação estar pronta', async () => {
    const response = await request(app).get('/health/ready').expect(503);

    expect(response.body).toMatchObject({
      status: 'not_ready',
      state: 'created',
    });
    expect(response.body.checks).toEqual([]);
  });

  it('readiness responde 200 quando o ciclo de vida está ready', async () => {
    lifecycle.markInitializing();
    lifecycle.markReady();

    const response = await request(app).get('/health/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ready',
      state: 'ready',
    });
  });

  it('readiness bloqueia quando uma dependência crítica está em baixo', async () => {
    lifecycle.markInitializing();
    lifecycle.markReady();
    health.set('database', 'down', true);

    const response = await request(app).get('/health/ready').expect(503);

    expect(response.body.status).toBe('not_ready');
    expect(response.body.checks).toContainEqual({
      name: 'database',
      status: 'down',
      critical: true,
    });
  });

  it('readiness mantém-se 200 com dependências opcionais degradadas', async () => {
    lifecycle.markInitializing();
    lifecycle.markReady();
    health.set('redis', 'degraded');

    const response = await request(app).get('/ready').expect(200);

    expect(response.body.status).toBe('ready');
    expect(response.body.checks).toContainEqual({
      name: 'redis',
      status: 'degraded',
      critical: false,
    });
  });

  it('mantém o health de infraestrutura em /api/v1/health', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      success: true,
      status: 'healthy',
    });
  });

  // --------------------------------------------------------
  // BOOT-006 — 404 consistente
  // --------------------------------------------------------

  it('devolve 404 com envelope consistente para rota inexistente', async () => {
    const response = await request(app).get('/api/v1/definitely-not-a-route').expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Route not found',
        path: '/api/v1/definitely-not-a-route',
        method: 'GET',
      },
    });
  });

  // --------------------------------------------------------
  // BOOT-007 — correliação de requisições
  // --------------------------------------------------------

  it('gera um X-Request-Id quando o cliente não envia um', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('propaga o X-Request-Id do cliente (trace entre serviços)', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Request-Id', 'gateway-42')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('gateway-42');
  });

  it('substitui um X-Request-Id malformado', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Request-Id', 'invalid id with spaces & symbols!')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('invalid id with spaces & symbols!');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  // --------------------------------------------------------
  // BOOT-008 — draining
  // --------------------------------------------------------

  it('rejeita novos pedidos durante o encerramento', async () => {
    lifecycle.markInitializing();
    lifecycle.markReady();
    lifecycle.beginDrain();

    const blocked = await request(app).get('/api/v1/health').expect(503);

    expect(blocked.body.error).toMatchObject({
      message: 'Service is shutting down',
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
    });
    expect(blocked.headers['retry-after']).toBe('5');
  });

  it('mantém os health checks acessíveis durante o draining', async () => {
    lifecycle.markInitializing();
    lifecycle.markReady();
    lifecycle.beginDrain();

    await request(app).get('/health/live').expect(200);
    await request(app).get('/health').expect(200);

    // 503 vem do readiness (corpo com `checks`), não do drain guard.
    const readiness = await request(app).get('/health/ready').expect(503);

    expect(readiness.body.state).toBe('draining');
    expect(readiness.body.checks).toEqual([]);
  });
});

// ============================================================
// 2. VALIDAÇÃO DE AMBIENTE (BOOT-001)
// ============================================================

describe('bootstrap — validação de ambiente (BOOT-001)', () => {
  it('falha quando falta o segredo JWT', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'test' })).toThrow();
    expect(() => loadEnvironment({ NODE_ENV: 'test', JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
  });

  it('falha com porta fora do intervalo válido', () => {
    expect(() => loadEnvironment({ JWT_SECRET: 'x', PORT: '0' })).toThrow();
    expect(() => loadEnvironment({ JWT_SECRET: 'x', PORT: '70000' })).toThrow();
    expect(() => loadEnvironment({ JWT_SECRET: 'x', PORT: 'abc' })).toThrow();
  });

  it('falha com timeout de encerramento inválido', () => {
    expect(() => loadEnvironment({ JWT_SECRET: 'x', SHUTDOWN_TIMEOUT_MS: '0' })).toThrow();
    expect(() => loadEnvironment({ JWT_SECRET: 'x', SHUTDOWN_TIMEOUT_MS: 'abc' })).toThrow();
  });

  it('falha com HOST vazio', () => {
    expect(() => loadEnvironment({ JWT_SECRET: 'x', HOST: '' })).toThrow();
  });

  it('falha com NODE_ENV desconhecido', () => {
    expect(() => loadEnvironment({ JWT_SECRET: 'x', NODE_ENV: 'staging' })).toThrow();
  });

  it('aplica omissões válidas', () => {
    const env = loadEnvironment({ JWT_SECRET: 'x' });

    // `loadEnvironment` devolve o EnvVars COMPLETO (Módulo 02) —
    // verifica-se apenas o que este teste cobre.
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3333,
      HOST: '0.0.0.0',
      SHUTDOWN_TIMEOUT_MS: 10000,
      JWT_SECRET: 'x',
    });
  });

  it('devolve a configuração tipada do bootstrap', () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      PORT: '4000',
      HOST: '127.0.0.1',
      SHUTDOWN_TIMEOUT_MS: '5000',
      JWT_SECRET: 's3cret',
    });

    expect(config).toEqual({
      nodeEnv: 'test',
      port: 4000,
      host: '127.0.0.1',
      jwtSecret: 's3cret',
      shutdownTimeoutMs: 5000,
    });
  });

  it('envolve o erro de forma controlada (BOOT-006)', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).toThrow(
      /\[bootstrap\] invalid environment/,
    );
  });
});

// ============================================================
// 3. MÓDULOS (BOOT-003 / BOOT-010)
// ============================================================

describe('bootstrap — módulos', () => {
  it('corre a fase de registo de todos os módulos antes de arrancar', async () => {
    const events: string[] = [];
    const context = createContext();

    const modules: ModuleDefinition[] = [
      {
        name: 'a',
        register: () => {
          events.push('register:a');
        },
        init: () => {
          events.push('init:a');
        },
      },
      {
        name: 'b',
        register: () => {
          events.push('register:b');
        },
        init: () => {
          events.push('init:b');
        },
      },
    ];

    await initializeModules(context, modules);

    expect(events).toEqual(['register:a', 'register:b', 'init:a', 'init:b']);
  });

  it('permite aos módulos registar serviços no contentor (BOOT-002)', async () => {
    const context = createContext();

    await initializeModules(context, [
      {
        name: 'payments',
        register: (container) => {
          container.register('payments.gateway', () => ({ ping: true }));
        },
        init: () => {},
      },
    ]);

    expect(context.container.resolve<{ ping: boolean }>('payments.gateway')).toEqual({
      ping: true,
    });
  });

  it('rejeita módulos com nomes duplicados (BOOT-003)', async () => {
    const context = createContext();

    const modules: ModuleDefinition[] = [
      { name: 'dup', init: () => {} },
      { name: 'dup', init: () => {} },
    ];

    await expect(initializeModules(context, modules)).rejects.toThrow('duplicate module: dup');
  });

  it('inicializa pela ordem dada e encerra pela inversa', async () => {
    const events: string[] = [];
    const context = createContext();

    const modules: ModuleDefinition[] = [
      {
        name: 'a',
        init: () => {
          events.push('init:a');
        },
        shutdown: () => {
          events.push('shutdown:a');
        },
      },
      {
        name: 'b',
        init: () => {
          events.push('init:b');
        },
        shutdown: () => {
          events.push('shutdown:b');
        },
      },
    ];

    const initialized = await initializeModules(context, modules);

    expect(initialized.map((module) => module.name)).toEqual(['a', 'b']);

    const errors = await shutdownModules(context, initialized);

    expect(errors).toEqual([]);
    expect(events).toEqual(['init:a', 'init:b', 'shutdown:b', 'shutdown:a']);
  });

  it('faz rollback e propaga o erro de um módulo crítico (BOOT-010)', async () => {
    const events: string[] = [];
    const context = createContext();

    const modules: ModuleDefinition[] = [
      {
        name: 'a',
        init: () => {
          events.push('init:a');
        },
        shutdown: () => {
          events.push('shutdown:a');
        },
      },
      {
        name: 'boom',
        critical: true,
        init: () => {
          throw new Error('database unavailable');
        },
      },
      {
        name: 'c',
        init: () => {
          events.push('init:c');
        },
      },
    ];

    await expect(initializeModules(context, modules)).rejects.toThrow('database unavailable');

    // "c" nunca chegou a arrancar; "a" foi libertado (BOOT-010).
    expect(events).toEqual(['init:a', 'shutdown:a']);
  });

  it('continua em modo degradado quando um módulo opcional falha', async () => {
    const context = createContext();

    const modules: ModuleDefinition[] = [
      {
        name: 'cache',
        init: () => {
          throw new Error('redis offline');
        },
      },
      {
        name: 'jobs',
        init: () => {},
      },
    ];

    const initialized = await initializeModules(context, modules);

    expect(initialized.map((module) => module.name)).toEqual(['jobs']);
    expect(context.health.snapshot()).toEqual({
      status: 'degraded',
      checks: [{ name: 'cache', status: 'down', critical: false }],
    });
  });

  it('agrega falhas de shutdown sem impedir os restantes', async () => {
    const events: string[] = [];
    const context = createContext();

    const modules: ModuleDefinition[] = [
      {
        name: 'broken',
        shutdown: () => {
          events.push('shutdown:broken');
          throw new Error('already closed');
        },
      },
      {
        name: 'healthy',
        shutdown: () => {
          events.push('shutdown:healthy');
        },
      },
    ];

    const errors = await shutdownModules(context, modules);

    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('already closed');
    // Ordem inversa; a falha de "broken" não impede "healthy".
    expect(events).toEqual(['shutdown:healthy', 'shutdown:broken']);
  });
});

// ============================================================
// 4. ERROS OPERACIONAIS (BOOT-006)
// ============================================================

describe('bootstrap — erros operacionais (BOOT-006)', () => {
  it('devolve a mensagem de um HttpError 4xx', async () => {
    const context = createContext();
    const app = createApp({
      context,
      registerRoutes: (expressApp) => {
        expressApp.get('/boom/client', () => {
          throw new HttpError(422, 'Company name is required', 'VALIDATION_ERROR');
        });
      },
    });

    const response = await request(app).get('/boom/client').expect(422);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Company name is required',
        code: 'VALIDATION_ERROR',
        statusCode: 422,
        timestamp: expect.any(String),
      },
    });
  });

  it('nunca divulga detalhes internos de um HttpError 5xx', async () => {
    const context = createContext();
    const app = createApp({
      context,
      registerRoutes: (expressApp) => {
        expressApp.get('/boom/internal', () => {
          throw new HttpError(500, 'SQLITE_BUSY: database is locked');
        });
      },
    });

    const response = await request(app).get('/boom/internal').expect(500);

    expect(response.body.error).toMatchObject({
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
    });
    expect(JSON.stringify(response.body)).not.toContain('SQLITE_BUSY');
  });

  it('devolve 400 para JSON inválido', async () => {
    const context = createContext();
    const app = createApp({ context });

    const response = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_JSON');
  });
});

// ============================================================
// 5. SHUTDOWN (BOOT-008)
// ============================================================

describe('bootstrap — shutdown gracioso (BOOT-008)', () => {
  let context: ApplicationContext;
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeEach(async () => {
    context = createContext();
    server = createServer(createApp({ context }));
    port = await listenEphemeral(server);
  });

  afterEach(async () => {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('encerra o servidor, os módulos e marca o ciclo como parado', async () => {
    const events: string[] = [];

    const modules: ModuleDefinition[] = [
      {
        name: 'a',
        shutdown: () => {
          events.push('shutdown:a');
        },
      },
      {
        name: 'b',
        shutdown: () => {
          events.push('shutdown:b');
        },
      },
    ];

    const shutdown = createShutdownHandler({
      context,
      httpServer: server,
      getModules: () => modules,
    });

    // Tráfego normal antes do encerramento.
    await get(port).then((status) => expect(status).toBe(200));

    await shutdown('test');

    expect(server.listening).toBe(false);
    expect(context.lifecycle.state).toBe('stopped');
    expect(events).toEqual(['shutdown:b', 'shutdown:a']);

    // Sem porta aberta: novas ligações são recusadas.
    await expect(get(port)).rejects.toThrow();
  });

  it('é idempotente — chamadas repetidas não repetem o trabalho', async () => {
    let shutdowns = 0;

    const shutdown = createShutdownHandler({
      context,
      httpServer: server,
      getModules: () => [
        {
          name: 'once',
          shutdown: () => {
            shutdowns += 1;
          },
        },
      ],
    });

    await shutdown('first');
    await shutdown('second');

    expect(shutdowns).toBe(1);
    expect(context.lifecycle.state).toBe('stopped');
  });

  it('agrega falhas do encerramento em ShutdownError (BOOT-006)', async () => {
    const events: string[] = [];

    const shutdown = createShutdownHandler({
      context,
      httpServer: server,
      getModules: () => [
        {
          name: 'good',
          shutdown: () => {
            events.push('good');
          },
        },
        {
          name: 'bad',
          shutdown: () => {
            events.push('bad');
            throw new Error('connection pool leaked');
          },
        },
      ],
    });

    const failure = await shutdown('test').catch((error) => error);

    expect(failure).toBeInstanceOf(ShutdownError);
    expect(failure.errors).toHaveLength(1);
    expect(String(failure.errors[0])).toContain('connection pool leaked');

    // Falha explícita: ciclo marcado como failed e servidor fechado.
    expect(context.lifecycle.state).toBe('failed');
    expect(server.listening).toBe(false);
    expect(events).toEqual(['bad', 'good']);
  });

  it('rejeita novos pedidos durante o draining antes de fechar', async () => {
    const shutdown = createShutdownHandler({
      context,
      httpServer: server,
      getModules: () => [],
      timeoutMs: 1000,
    });

    context.lifecycle.markInitializing();
    context.lifecycle.markReady();

    // O draining começa no arranque do shutdown; para observar o
    // 503 com o servidor ainda a aceitar ligações, entra-se em
    // draining explicitamente antes de fechar.
    context.lifecycle.beginDrain();

    const response = await request(`http://127.0.0.1:${port}`).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.headers['retry-after']).toBe('5');

    // A liveness continua a responder durante o draining.
    await request(`http://127.0.0.1:${port}`).get('/health/live').expect(200);

    await shutdown('test');

    expect(server.listening).toBe(false);
    expect(context.lifecycle.state).toBe('stopped');
  });

  it('closeHttpServer é seguro para servidor já fechado', async () => {
    const closed = createServer(createApp({ context: createContext() }));
    const closedPort = await listenEphemeral(closed);

    await closeHttpServer(closed, 1000);
    await closeHttpServer(closed, 1000);

    expect(closed.listening).toBe(false);
    await expect(get(closedPort)).rejects.toThrow();
  });
});
