/**
 * Estados possíveis de uma empresa (tenant).
 */
export const COMPANY_STATUSES = ["ACTIVE", "SUSPENDED"] as const;

export type CompanyStatusValue = (typeof COMPANY_STATUSES)[number];

export class CompanyStatus {
    private constructor(
        public readonly value: CompanyStatusValue,
    ) { }

    static active(): CompanyStatus {
        return new CompanyStatus("ACTIVE");
    }

    static suspended(): CompanyStatus {
        return new CompanyStatus("SUSPENDED");
    }

    static from(value: string): CompanyStatus {
        const normalized =
            String(value).toUpperCase() as CompanyStatusValue;

        if (!COMPANY_STATUSES.includes(normalized)) {
            throw new Error(`Invalid company status: ${value}.`);
        }

        return new CompanyStatus(normalized);
    }

    isActive(): boolean {
        return this.value === "ACTIVE";
    }

    isSuspended(): boolean {
        return this.value === "SUSPENDED";
    }

    /** Só uma empresa activa pode ser suspensa. */
    canSuspend(): boolean {
        return this.isActive();
    }

    /** Só uma empresa suspensa pode ser reactivada. */
    canActivate(): boolean {
        return this.isSuspended();
    }

    equals(other: CompanyStatus): boolean {
        return this.value === other.value;
    }
}
