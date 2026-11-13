export interface RateLimitOptions {
    maxAttempts: number;
    windowMs: number;
}

interface RateLimitRecord {
    count: number;
    expiresAt: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfter: number;
}

export class RateLimiter {
    private readonly records = new Map<
        string,
        RateLimitRecord
    >();

    constructor(
        private readonly options: RateLimitOptions,
    ) { }

    public check(
        key: string,
    ): RateLimitResult {
        const now = Date.now();

        const record = this.records.get(key);

        if (!record || record.expiresAt <= now) {
            this.records.set(key, {
                count: 1,
                expiresAt: now + this.options.windowMs,
            });

            return {
                allowed: true,
                remaining: Math.max(
                    this.options.maxAttempts - 1,
                    0,
                ),
                retryAfter: 0,
            };
        }

        if (
            record.count >=
            this.options.maxAttempts
        ) {
            return {
                allowed: false,
                remaining: 0,
                retryAfter: Math.ceil(
                    (record.expiresAt - now) / 1000,
                ),
            };
        }

        record.count += 1;

        return {
            allowed: true,
            remaining:
                this.options.maxAttempts -
                record.count,
            retryAfter: 0,
        };
    }

    public reset(key: string): void {
        this.records.delete(key);
    }

    public clear(): void {
        this.records.clear();
    }
}