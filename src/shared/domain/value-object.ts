/**
 * ============================================================
 * VALUE OBJECT — Módulo 03 (shared/domain)
 * ============================================================
 *
 * Conceito DDD: imutável e definido pelos VALORES.
 *
 *   - `props` é congelado (imutabilidade superficial) na
 *     construção — alterar um VO significa criar outro;
 *   - `equals` compara construtor + valores das props de
 *     primeiro nível (Datas são comparadas por instante).
 */

export type ValueObjectProps = Record<string, unknown>;

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  // Estruturas aninhadas são referências distintas: a
  // comparação é deliberadamente superficial.
  return false;
}

export abstract class ValueObject<
  TProps extends ValueObjectProps = ValueObjectProps,
> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  public equals(other: unknown): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (!(other instanceof ValueObject)) {
      return false;
    }

    if (this.constructor !== other.constructor) {
      return false;
    }

    const left = this.props as Record<string, unknown>;
    const right = other.props as Record<string, unknown>;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        valuesEqual(left[key], right[key]),
    );
  }

  /** Cópia das props para persistência/serialização seguras. */
  public toPrimitives(): Readonly<TProps> {
    return { ...(this.props as TProps) };
  }
}
