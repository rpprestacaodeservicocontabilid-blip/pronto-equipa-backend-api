import { SessionManagerPort } from "../ports/session-manager.port";
import { NotFoundError } from "../../../../shared/errors/app.error";

export interface RevokeSessionInput {
    userId: number;

    sessionId: number;
}

export class RevokeSessionUseCase {
    constructor(
        private readonly sessionManager: SessionManagerPort,
    ) { }

    async execute(
        input: RevokeSessionInput,
    ): Promise<void> {
        const session =
            await this.sessionManager.getSession(
                input.sessionId,
            );

        if (
            !session ||
            session.userId !== input.userId
        ) {
            throw new NotFoundError(
                "Session",
            );
        }

        await this.sessionManager.revokeSession(
            input.sessionId,
        );
    }
}