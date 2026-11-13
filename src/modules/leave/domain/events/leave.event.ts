import { DomainEvent } from '../../../../shared/domain/domain-event';

/**
 * Evento de domínio do módulo `leave`.
 *
 * Segue o contrato canónico do Módulo 03 (`eventName` +
 * `aggregateId` + `occurredAt`) e acrescenta o contexto de
 * empresa e o payload que os consumidores (payroll,
 * notifications) precisam.
 *
 * Os eventos são escritos na tabela `leave_outbox` DENTRO da
 * transacção da operação (outbox transaccional) — a publicação
 * assíncrona é responsabilidade de um publicador futuro.
 */
export class LeaveEvent extends DomainEvent {
  public readonly eventName: string;
  public readonly companyId: number;
  public readonly payload: Record<string, unknown>;

  constructor(input: {
    eventName: string;
    aggregateId: string | number;
    companyId: number;
    occurredAt?: Date;
    payload?: Record<string, unknown>;
  }) {
    super({ aggregateId: input.aggregateId, occurredAt: input.occurredAt });
    this.eventName = input.eventName;
    this.companyId = input.companyId;
    this.payload = input.payload ?? {};
  }

  /** Nome do tipo de evento (alias canónico para o outbox). */
  get eventType(): string {
    return this.eventName;
  }
}
