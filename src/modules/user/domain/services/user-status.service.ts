import { User } from "../entities/user.entity";

export interface UserStatusService {
    activate(
        user: User,
    ): Promise<void>;

    deactivate(
        user: User,
    ): Promise<void>;

    suspend(
        user: User,
    ): Promise<void>;

    block(
        user: User,
    ): Promise<void>;
}