import { ValidationError } from '../../../../shared/errors/app.error';

/**
 * Duração de férias em dias (inteiros — sem ponto flutuante,
 * conforme a decisão de precisão da especificação).
 *
 * Os movimentos de saldo usam dias ASSINADOS; os pedidos usam
 * sempre duração positiva.
 */
export class LeaveDays {
  private constructor(readonly value: number) {}

  /** Duração positiva de um pedido/período (> 0). */
  static create(days: number): LeaveDays {
    if (!Number.isInteger(days) || days <= 0) {
      throw new ValidationError('Leave duration must be a positive whole number of days.');
    }
    if (days > 366) {
      throw new ValidationError('Leave duration cannot exceed 366 days.');
    }
    return new LeaveDays(days);
  }

  /** Dias de um movimento de saldo (assinado, nunca zero). */
  static signed(days: number): LeaveDays {
    if (!Number.isInteger(days) || days === 0) {
      throw new ValidationError('Leave movement must be a non-zero whole number of days.');
    }
    if (Math.abs(days) > 3660) {
      throw new ValidationError('Leave movement magnitude is out of range.');
    }
    return new LeaveDays(days);
  }

  get asNumber(): number {
    return this.value;
  }
}
