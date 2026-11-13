import { SessionManagerPort } from "../ports/session-manager.port";
import { NotFoundError } from "../../../../shared/errors/app.error";

export interface GetCurrentSessionInput {
    userId: number;

    sessionId: number;
}

export class GetCurrentSessionUseCase {
    constructor(
        private readonly sessionManager: SessionManagerPort,
    ) { }

    async execute(
        input: GetCurrentSessionInput,
    ) {
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

        return session;
    }
}