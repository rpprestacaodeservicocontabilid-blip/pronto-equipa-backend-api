export type SecurityEventLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface SecurityEvent {
  event: string;

  /**
   * Opcional: os métodos do logger (`info`/`warning`/`critical`)
   * definem o nível automaticamente ao gravar o evento.
   */
  level?: SecurityEventLevel;

  accountId?: number | null;
  userId?: number | null;

  ipAddress?: string | null;
  userAgent?: string | null;

  metadata?: Record<string, unknown>;
}

export class SecurityEventLogger {
  public info(event: SecurityEvent): void {
    this.write({
      ...event,
      level: 'INFO',
    });
  }

  public warning(event: SecurityEvent): void {
    this.write({
      ...event,
      level: 'WARNING',
    });
  }

  public critical(event: SecurityEvent): void {
    this.write({
      ...event,
      level: 'CRITICAL',
    });
  }

  private write(event: SecurityEvent): void {
    const payload = {
      timestamp: new Date().toISOString(),

      ...event,
    };

    console.log(JSON.stringify(payload));
  }
}
