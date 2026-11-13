import { User } from "../entities/user.entity";

export interface UserRepository {
    save(user: User): Promise<User>;

    update(user: User): Promise<User>;

    findById(
        userId: number,
    ): Promise<User | null>;

    findByEmail(
        email: string,
    ): Promise<User | null>;

    findByPhone(
        phone: string,
    ): Promise<User | null>;

    findByProfileId(
        profileId: number,
    ): Promise<User | null>;

    findAll(
        filters?: {
            status?: string;
            type?: string;
            roleId?: number;
            search?: string;
            page?: number;
            limit?: number;
        },
    ): Promise<{
        data: User[];
        total: number;
    }>;

    existsByEmail(
        email: string,
    ): Promise<boolean>;

    existsByPhone(
        phone: string,
    ): Promise<boolean>;

    delete(
        userId: number,
    ): Promise<void>;
}