import { User } from "../entities/user.entity";

export interface UserValidationService {
    validateCreate(
        input: {
            name: string;
            email: string;
            phone?: string | null;
        },
    ): Promise<void>;

    validateCreation(
        user: User,
    ): Promise<void>;

    validateUpdate(
        input: {
            name?: string;
            email?: string;
            phone?: string | null;
        },
    ): Promise<void>;

    ensureEmailAvailable(
        email: string,
        ignoredUserId?: number,
    ): Promise<void>;
}