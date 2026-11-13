import { Role } from "../entities/role.entity";

export interface RoleRepository {
    save(role: Role): Promise<Role>;

    update(role: Role): Promise<Role>;

    findById(
        roleId: number,
    ): Promise<Role | null>;

    findByName(
        name: string,
    ): Promise<Role | null>;

    findAll(
        filters?: {
            active?: boolean;
            system?: boolean;
        },
    ): Promise<Role[]>;

    findByUserId(
        userId: number,
    ): Promise<Role[]>;

    assignToUser(
        userId: number,
        roleId: number,
    ): Promise<void>;

    removeFromUser(
        userId: number,
        roleId: number,
    ): Promise<void>;

    delete(
        roleId: number,
    ): Promise<void>;
}