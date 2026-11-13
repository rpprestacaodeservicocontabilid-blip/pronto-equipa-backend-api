interface BlacklistedToken {
    expiresAt: number;
}

export class TokenBlacklist {
    private readonly tokens = new Map<
        string,
        BlacklistedToken
    >();

    public blacklist(
        token: string,
        expiresAt: number,
    ): void {
        this.tokens.set(token, {
            expiresAt,
        });
    }

    public isBlacklisted(
        token: string,
    ): boolean {
        const entry =
            this.tokens.get(token);

        if (!entry) {
            return false;
        }

        if (
            entry.expiresAt <= Date.now()
        ) {
            this.tokens.delete(token);
            return false;
        }

        return true;
    }

    public remove(
        token: string,
    ): void {
        this.tokens.delete(token);
    }

    public clearExpired(): void {
        const now = Date.now();

        for (const [
            token,
            entry,
        ] of this.tokens.entries()) {
            if (entry.expiresAt <= now) {
                this.tokens.delete(token);
            }
        }
    }
}