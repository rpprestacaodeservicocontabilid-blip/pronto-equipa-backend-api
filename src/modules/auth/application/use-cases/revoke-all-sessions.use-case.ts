import { SessionManagerPort } from '../ports/session-manager.port';

export interface RevokeAllSessionsInput {
  userId: number;

  exceptSessionId?: number;
}

export class RevokeAllSessionsUseCase {
  constructor(private readonly sessionManager: SessionManagerPort) {}

  async execute(input: RevokeAllSessionsInput): Promise<void> {
    await this.sessionManager.revokeAllSessions(input.userId, input.exceptSessionId);
  }
}
