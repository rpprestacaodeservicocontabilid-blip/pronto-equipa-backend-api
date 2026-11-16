/**
 * Módulo 03 — shared/domain
 *
 * Entidades, agregados, eventos, objectos de valor, erros de
 * domínio e compatibilidade com o EventBus existente.
 */

import { AggregateRoot } from '../../shared/domain/aggregate-root';
import { DomainError } from '../../shared/domain/domain-error';
import { DomainEvent } from '../../shared/domain/domain-event';
import type { DomainEventProps } from '../../shared/domain/domain-event';
import { Entity } from '../../shared/domain/entity';
import { ValueObject } from '../../shared/domain/value-object';
import { InMemoryEventBus } from '../../shared/events/event-bus';

// ============================================================
// FIXTURES
// ============================================================

class TestEntity extends Entity<{ name: string }> {
  private readonly entityId: number | null;

  constructor(id: number | null, name: string) {
    super({ name });
    this.entityId = id;
  }

  public get id(): number | null {
    return this.entityId;
  }

  public get name(): string {
    return this.props.name;
  }
}

class OtherEntity extends Entity<{ name: string }> {
  private readonly entityId: number | null;

  constructor(id: number | null, name: string) {
    super({ name });
    this.entityId = id;
  }

  public get id(): number | null {
    return this.entityId;
  }
}

class RenamedEvent extends DomainEvent {
  public readonly eventName = 'test.aggregate.renamed';

  constructor(
    aggregateId: number,
    public readonly newName: string,
  ) {
    super({ aggregateId });
  }
}

class TestAggregate extends AggregateRoot<{ name: string }> {
  private readonly entityId: number;

  constructor(id: number, name: string) {
    super({ name });
    this.entityId = id;
  }

  public get id(): number {
    return this.entityId;
  }

  public get name(): string {
    return this.props.name;
  }

  public rename(name: string): void {
    this.props.name = name;
    this.record(new RenamedEvent(this.entityId, name));
  }

  public discardEvents(): void {
    this.clearDomainEvents();
  }
}

class Money extends ValueObject<{ amount: number; currency: string }> {
  constructor(amount: number, currency: string) {
    super({ amount, currency });
  }

  public get amount(): number {
    return this.props.amount;
  }

  public get isFrozen(): boolean {
    return Object.isFrozen(this.props);
  }
}

class OtherMoney extends ValueObject<{ amount: number; currency: string }> {
  constructor(amount: number, currency: string) {
    super({ amount, currency });
  }
}

class MoneyWithDate extends ValueObject<{ createdAt: Date }> {
  constructor(createdAt: Date) {
    super({ createdAt });
  }
}

// ============================================================
// ENTITY
// ============================================================

describe('shared/domain — Entity', () => {
  test('entidades com o mesmo id são a mesma entidade', () => {
    const a = new TestEntity(1, 'Um');
    const b = new TestEntity(1, 'Outro nome');

    expect(a.equals(b)).toBe(true);
  });

  test('entidades com ids diferentes são distintas', () => {
    const a = new TestEntity(1, 'Um');
    const b = new TestEntity(2, 'Um');

    expect(a.equals(b)).toBe(false);
  });

  test('entidades sem id (não persistidas) só são iguais a si próprias', () => {
    const a = new TestEntity(null, 'Um');
    const b = new TestEntity(null, 'Um');

    expect(a.equals(a)).toBe(true);
    expect(a.equals(b)).toBe(false);
  });

  test('classes diferentes com o mesmo id não são iguais', () => {
    const a = new TestEntity(1, 'Um');
    const b = new OtherEntity(1, 'Um');

    expect(a.equals(b)).toBe(false);
  });

  test('equals(null) e equals(undefined) são false', () => {
    const a = new TestEntity(1, 'Um');

    expect(a.equals(null)).toBe(false);
    expect(a.equals(undefined)).toBe(false);
  });
});

// ============================================================
// AGGREGATE ROOT
// ============================================================

describe('shared/domain — AggregateRoot', () => {
  test('acumula eventos pendentes e drena com pullDomainEvents', () => {
    const aggregate = new TestAggregate(10, 'Antes');

    aggregate.rename('Depois');

    expect(aggregate.domainEvents).toHaveLength(1);
    expect(aggregate.name).toBe('Depois');

    const events = aggregate.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RenamedEvent);
    expect(aggregate.domainEvents).toHaveLength(0);
  });

  test('domainEvents devolve uma cópia (não expõe o array interno)', () => {
    const aggregate = new TestAggregate(10, 'Nome');

    aggregate.rename('Novo');

    const snapshot = aggregate.domainEvents;
    (snapshot as DomainEvent[]).push(new RenamedEvent(10, 'intruso'));

    expect(aggregate.domainEvents).toHaveLength(1);
  });

  test('clearDomainEvents descarta sem publicar (caminho de falha)', () => {
    const aggregate = new TestAggregate(10, 'Nome');

    aggregate.rename('Novo');
    aggregate.discardEvents();

    expect(aggregate.domainEvents).toHaveLength(0);
    expect(aggregate.pullDomainEvents()).toHaveLength(0);
  });

  test('o evento carrega agregado, identidade e instante', () => {
    const before = Date.now();
    const aggregate = new TestAggregate(42, 'Nome');

    aggregate.rename('Novo');

    const [event] = aggregate.pullDomainEvents() as RenamedEvent[];

    expect(event.aggregateId).toBe(42);
    expect(event.eventId).toBeTruthy();
    expect(event.eventName).toBe('test.aggregate.renamed');
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(event.newName).toBe('Novo');
  });
});

// ============================================================
// DOMAIN EVENT
// ============================================================

describe('shared/domain — DomainEvent', () => {
  test('gera eventId e occurredAt por omissão', () => {
    const event = new RenamedEvent(1, 'X');

    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  test('respeita occurredAt e eventId fornecidos', () => {
    const instant = new Date('2026-01-01T00:00:00.000Z');

    class CustomEvent extends DomainEvent {
      public readonly eventName = 'custom';

      constructor(props: DomainEventProps) {
        super(props);
      }
    }

    const event = new CustomEvent({
      aggregateId: 1,
      occurredAt: instant,
      eventId: 'fixed-id',
    });

    expect(event.eventId).toBe('fixed-id');
    expect(event.occurredAt).toBe(instant);
    expect(event.aggregateId).toBe(1);
  });
});

// ============================================================
// VALUE OBJECT
// ============================================================

describe('shared/domain — ValueObject', () => {
  test('valores iguais produzem objectos iguais', () => {
    expect(new Money(100, 'AOA').equals(new Money(100, 'AOA'))).toBe(true);
  });

  test('valores diferentes produzem objectos distintos', () => {
    expect(new Money(100, 'AOA').equals(new Money(200, 'AOA'))).toBe(false);
    expect(new Money(100, 'AOA').equals(new Money(100, 'USD'))).toBe(false);
  });

  test('classes diferentes nunca são iguais', () => {
    expect(new Money(100, 'AOA').equals(new OtherMoney(100, 'AOA'))).toBe(false);
  });

  test('comparações com null, undefined e objectos soltos são false', () => {
    const money = new Money(100, 'AOA');

    expect(money.equals(null)).toBe(false);
    expect(money.equals(undefined)).toBe(false);
    expect(money.equals({ amount: 100, currency: 'AOA' })).toBe(false);
  });

  test('props são congeladas (imutabilidade superficial)', () => {
    expect(new Money(100, 'AOA').isFrozen).toBe(true);
  });

  test('Datas são comparadas por instante', () => {
    const a = new MoneyWithDate(new Date('2026-06-01T12:00:00.000Z'));
    const b = new MoneyWithDate(new Date('2026-06-01T12:00:00.000Z'));
    const c = new MoneyWithDate(new Date('2026-06-01T12:00:01.000Z'));

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  test('toPrimitives devolve uma cópia utilizável', () => {
    const primitives = new Money(100, 'AOA').toPrimitives();

    expect(primitives).toEqual({ amount: 100, currency: 'AOA' });
    expect(primitives).not.toBe(new Money(100, 'AOA').toPrimitives());
  });
});

// ============================================================
// DOMAIN ERROR
// ============================================================

describe('shared/domain — DomainError', () => {
  test('é um Error com nome, código e detalhes', () => {
    const error = new DomainError('Salário inválido', 'INVALID_SALARY', { field: 'amount' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
    expect(error.message).toBe('Salário inválido');
    expect(error.code).toBe('INVALID_SALARY');
    expect(error.details).toEqual({ field: 'amount' });
  });

  test('usa código e detalhes por omissão', () => {
    const error = new DomainError('Falha');

    expect(error.code).toBe('DOMAIN_ERROR');
    expect(error.details).toBeUndefined();
  });
});

// ============================================================
// COMPATIBILIDADE COM O EVENTBUS EXISTENTE
// ============================================================

describe('shared/events — EventBus com o DomainEvent partilhado', () => {
  test('publish entrega o evento aos subscritores', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];

    bus.subscribe('test.aggregate.renamed', (event: DomainEvent) => {
      received.push(event);
    });

    const aggregate = new TestAggregate(7, 'Nome');
    aggregate.rename('Novo');

    const [event] = aggregate.pullDomainEvents();
    await bus.publish(event);

    expect(received).toEqual([event]);
  });

  test('publishAll entrega todos os eventos', async () => {
    const bus = new InMemoryEventBus();
    const received: string[] = [];

    bus.subscribe('test.aggregate.renamed', (event: DomainEvent) => {
      received.push(event.eventName);
    });

    const aggregate = new TestAggregate(7, 'Nome');
    aggregate.rename('A');
    aggregate.rename('B');

    await bus.publishAll(aggregate.pullDomainEvents());

    expect(received).toEqual(['test.aggregate.renamed', 'test.aggregate.renamed']);
  });

  test('unsubscribe deixa de entregar eventos', async () => {
    const bus = new InMemoryEventBus();
    let calls = 0;
    const handler = (): void => {
      calls += 1;
    };

    bus.subscribe('test.aggregate.renamed', handler);
    bus.unsubscribe('test.aggregate.renamed', handler);

    await bus.publish(new RenamedEvent(1, 'X'));

    expect(calls).toBe(0);
  });
});
