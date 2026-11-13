/**
 * Estados possíveis de um membro dentro de uma empresa.
 *
 * `REMOVED` é um estado terminal mantido por auditoria — o registo
 * não é apagado da base de dados.
 */
export const MEMBER_STATUSES = [
    "ACTIVE",
    "SUSPENDED",
    "REMOVED",
] as const;

export type MemberStatusValue = (typeof MEMBER_STATUSES)[number];

export class MemberStatus {
    private constructor(
        public readonly value: MemberStatusValue,
    ) { }

    static active(): MemberStatus {
        return new MemberStatus("ACTIVE");
    }

    static suspended(): MemberStatus {
        return new MemberStatus("SUSPENDED");
    }

    static removed(): MemberStatus {
        return new MemberStatus("REMOVED");
    }

    static from(value: string): MemberStatus {
        const normalized =
            String(value).toUpperCase() as MemberStatusValue;

        if (!MEMBER_STATUSES.includes(normalized)) {
            throw new Error(`Invalid member status: ${value}.`);
        }

        return new MemberStatus(normalized);
    }

    isActive(): boolean {
        return this.value === "ACTIVE";
    }

    isRemoved(): boolean {
        return this.value === "REMOVED";
    }

    equals(other: MemberStatus): boolean {
        return this.value === other.value;
    }
}
