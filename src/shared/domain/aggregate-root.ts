/**
 * ============================================================
 * AGGREGATE ROOT — Módulo 03 (shared/domain)
 * ============================================================
 *
 * Raiz de agregado: `Entity` + eventos de domínio pendentes.
 *
 *   - `record(event)`      acumula eventos durante a mutação;
 *   - `domainEvents`       cópia dos pendentes (para leitura);
 *   - `pullDomainEvents()` drena e devolve (o chamador publica
 *                          e limpa — transacção → eventos);
 *   - `clearDomainEvents()` descarta sem publicar (rollback).
 */

import { DomainEvent } from "./domain-event";
import { Entity } from "./entity";

export abstract class AggregateRoot<TProps> extends Entity<TProps> {
  private readonly pendingEvents: DomainEvent[] = [];

  protected constructor(props: TProps) {
    super(props);
  }

  /** Acumula um evento a ser publicado após o commit. */
  protected record(event: DomainEvent): void {
    this.pendingEvents.push(event);
  }

  /** Cópia dos eventos pendentes (não drena). */
  public get domainEvents(): ReadonlyArray<DomainEvent> {
    return [...this.pendingEvents];
  }

  /** Drena os eventos pendentes: quem chama é responsável publicar. */
  public pullDomainEvents(): DomainEvent[] {
    return this.pendingEvents.splice(0, this.pendingEvents.length);
  }

  /** Descarta os eventos sem publicar (caminho de falha). */
  public clearDomainEvents(): void {
    this.pendingEvents.length = 0;
  }
}
