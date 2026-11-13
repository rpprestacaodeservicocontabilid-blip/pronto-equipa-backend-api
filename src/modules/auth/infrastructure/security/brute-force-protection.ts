export interface BruteForceProtectionOptions {
    maxFailures: number;
    lockDurationMs: number;
}

interface FailureRecord {
    failures: number;
    lockedUntil: number | null;
}

export class BruteForceProtection {
    private readonly records = new Map<
        string,
        FailureRecord
    >();

    constructor(
        private readonly options: BruteForceProtectionOptions,
    ) { }

    public isBlocked(
        identifier: string,
    ): boolean {
        const record =
            this.records.get(identifier);

        if (!record) {
            return false;
        }

        if (
            record.lockedUntil &&
            record.lockedUntil > Date.now()
        ) {
            return true;
        }

        if (
            record.lockedUntil &&
            record.lockedUntil <= Date.now()
        ) {
            this.records.delete(identifier);
            return false;
        }

        return false;
    }

    public registerFailure(
        identifier: string,
    ): void {
        const existing =
            this.records.get(identifier);

        if (!existing) {
            this.records.set(identifier, {
                failures: 1,
                lockedUntil: null,
            });

            return;
        }

        existing.failures += 1;

        if (
            existing.failures >=
            this.options.maxFailures
        ) {
            existing.lockedUntil =
                Date.now() +
                this.options.lockDurationMs;
        }
    }

    public registerSuccess(
        identifier: string,
    ): void {
        this.records.delete(identifier);
    }

    public getFailures(
        identifier: string,
    ): number {
        return (
            this.records.get(identifier)?.failures ??
            0
        );
    }

    public reset(
        identifier: string,
    ): void {
        this.records.delete(identifier);
    }
}