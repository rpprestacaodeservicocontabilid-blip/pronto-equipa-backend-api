/**
 * Composição do saldo de férias derivada do ledger de movimentos.
 *
 *   Disponível = Direitos + Ajustes − Reservados − Utilizados
 *
 * Os movimentos são guardados com sinal; a fórmula acima é
 * equivalente a `Σ days` sobre TODOS os movimentos (a reserva é
 * negativa e a libertação positiva), pelo que não há dupla
 * contabilização (RN-010 / RN-014).
 */

export type LeaveMovementType = 'ACCRUAL' | 'ADJUSTMENT' | 'RESERVATION' | 'RELEASE' | 'USAGE';

export const LEAVE_MOVEMENT_TYPES: readonly LeaveMovementType[] = [
  'ACCRUAL',
  'ADJUSTMENT',
  'RESERVATION',
  'RELEASE',
  'USAGE',
];

export const isLeaveMovementType = (value: unknown): value is LeaveMovementType =>
  typeof value === 'string' && (LEAVE_MOVEMENT_TYPES as readonly string[]).includes(value);

export interface LeaveBalanceProps {
  /** Σ ACCRUAL — direitos adquiridos. */
  entitled: number;
  /** Σ ADJUSTMENT — ajustes justificados (podem ser negativos). */
  adjusted: number;
  /** −(Σ RESERVATION + Σ RELEASE) — reserva ainda por reconciliar. */
  reserved: number;
  /** −Σ USAGE — dias efectivamente gozados. */
  used: number;
  /** Σ de todos os movimentos — saldo disponível. */
  available: number;
}

export class LeaveBalance {
  private constructor(readonly props: LeaveBalanceProps) {}

  /**
   * Deriva o saldo a partir dos movimentos assinados.
   *
   * A verdade do saldo é `Σ days` (o ledger é a fonte de
   * verdade — RN-010). As métricas de apresentação são:
   *
   *   reserved = −(Σ RESERVATION + Σ RELEASE)
   *              (a RELEASE anula a reserva correspondente)
   *   used     = −Σ USAGE
   *   available= Σ days = entitled + adjusted − reserved − used
   */
  static fromMovements(
    movements: ReadonlyArray<{ movementType: LeaveMovementType; days: number }>,
  ): LeaveBalance {
    let entitled = 0;
    let adjusted = 0;
    let reservation = 0;
    let release = 0;
    let usage = 0;
    let total = 0;

    for (const movement of movements) {
      total += movement.days;
      switch (movement.movementType) {
        case 'ACCRUAL':
          entitled += movement.days;
          break;
        case 'ADJUSTMENT':
          adjusted += movement.days;
          break;
        case 'RESERVATION':
          reservation += movement.days;
          break;
        case 'RELEASE':
          release += movement.days;
          break;
        case 'USAGE':
          usage += movement.days;
          break;
      }
    }

    // `+ 0` normaliza o negativo zero do JavaScript (`-0`) —
    // um saldo sem reserva/utilização é exactamente zero.
    const reserved = -(reservation + release) + 0;
    const used = -usage + 0;
    const available = total + 0;

    return new LeaveBalance({ entitled, adjusted, reserved, used, available });
  }

  get available(): number {
    return this.props.available;
  }

  get entitled(): number {
    return this.props.entitled;
  }

  get adjusted(): number {
    return this.props.adjusted;
  }

  get reserved(): number {
    return this.props.reserved;
  }

  get used(): number {
    return this.props.used;
  }

  /** RN-012: impede consumo superior ao saldo permitido. */
  canCover(days: number): boolean {
    return this.props.available >= days;
  }

  toPrimitives(): LeaveBalanceProps {
    return { ...this.props };
  }
}
