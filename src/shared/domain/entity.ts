/**
 * ============================================================
 * ENTITY — Módulo 03 (shared/domain)
 * ============================================================
 *
 * Conceito DDD: identidade ao longo do tempo.
 *
 *   - duas entidades com o MESMO id são a mesma entidade,
 *     mesmo que os atributos difiram;
 *   - entidades sem id (ainda não persistidas) só são
 *     iguais a si próprias (identidade de objecto).
 *
 * A identidade é abstracta e cada módulo decide-a
 * (`number` na maioria das tabelas, `string` para UUIDs).
 */

export abstract class Entity<TProps> {
  protected readonly props: TProps;

  protected constructor(props: TProps) {
    this.props = props;
  }

  /** Identidade da entidade. `null` quando ainda não persistida. */
  public abstract get id(): string | number | null;

  public equals(other: Entity<TProps> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (this.constructor !== other.constructor) {
      return false;
    }

    const id = this.id;

    return id !== null && id === other.id;
  }
}
