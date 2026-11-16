import { Container } from '../../bootstrap/container';
import { HealthRegistry } from '../../bootstrap/health';
import { Lifecycle } from '../../bootstrap/lifecycle';

import type {
  ApplicationContext,
  BootstrapConfig,
  Logger,
} from '../../bootstrap/types/application-context';

// ============================================================
// BOOT-002 — container de injecção de dependências
// ============================================================

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  http() {},
};

const config: BootstrapConfig = {
  nodeEnv: 'test',
  port: 3333,
  host: '127.0.0.1',
  jwtSecret: 'secret',
  shutdownTimeoutMs: 10000,
};

/** Contentor isolado, sem os registos base da aplicação. */
function createContainer(): Container {
  const container = new Container();

  const context: ApplicationContext = {
    config,
    container,
    lifecycle: new Lifecycle(),
    health: new HealthRegistry(),
    logger: silentLogger,
    startedAt: new Date(),
  };

  container.bind(context);

  return container;
}

describe('Container', () => {
  it('cacheia a factory como singleton', () => {
    const container = createContainer();

    let calls = 0;
    container.register('counter', () => ++calls);

    expect(container.resolve('counter')).toBe(1);
    expect(container.resolve('counter')).toBe(1);
    expect(calls).toBe(1);
  });

  it('rejeita registo duplicado', () => {
    const container = createContainer();

    container.register('service', () => 1);

    expect(() => container.register('service', () => 2)).toThrow(/duplicate registration/);
  });

  it('rejeita token desconhecido', () => {
    const container = createContainer();

    expect(() => container.resolve('missing')).toThrow(/unknown token/);
    expect(container.tryResolve('missing')).toBeUndefined();
  });

  it('detecta dependência circular directa', () => {
    const container = createContainer();

    container.register('self', (context) => context.container.resolve('self'));

    expect(() => container.resolve('self')).toThrow(/Circular dependency: self/);
  });

  it('detecta dependência circular indirecta (a → b → a)', () => {
    const container = createContainer();

    container.register('a', (context) => context.container.resolve('b'));
    container.register('b', (context) => context.container.resolve('a'));

    expect(() => container.resolve('a')).toThrow(/Circular dependency/);
  });

  it('não cacheia factory que falha — nova tentativa tenta de novo', () => {
    const container = createContainer();

    let attempts = 0;
    container.register('flaky', () => {
      attempts += 1;
      throw new Error('boom');
    });

    expect(() => container.resolve('flaky')).toThrow('boom');
    expect(() => container.resolve('flaky')).toThrow('boom');
    expect(attempts).toBe(2);
    expect(container.tryResolve('flaky')).toBeUndefined();
  });

  it('exige contexto ligado antes de resolver', () => {
    const container = new Container();
    container.register('service', () => ({}));

    expect(() => container.resolve('service')).toThrow(/no application context/);
    expect(container.isBound).toBe(false);
  });

  it('expõe tokens registados e liberta tudo no dispose', () => {
    const container = createContainer();

    container.register('service', () => ({}));
    container.register('other', () => ({}));

    expect(container.has('service')).toBe(true);
    expect(container.tokens).toEqual(['service', 'other']);

    container.resolve('service');

    container.dispose();

    expect(container.isBound).toBe(false);
    expect(container.has('service')).toBe(false);
    expect(container.tokens).toEqual([]);
    expect(() => container.resolve('service')).toThrow();
  });
});
