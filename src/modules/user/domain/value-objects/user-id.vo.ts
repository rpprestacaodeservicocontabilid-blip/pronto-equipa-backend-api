export class UserId {
    private constructor(
        private readonly value: number,
    ) {
        if (
            !Number.isInteger(value) ||
            value < 0
        ) {
            throw new Error(
                "User ID must be a non-negative integer.",
            );
        }
    }

    /**
     * Cria um UserId.
     *
     * value = 0:
     * Representa um ID temporário para uma entidade
     * que ainda não foi persistida.
     *
     * value > 0:
     * Representa um ID persistido.
     */
    public static create(
        value: number,
    ): UserId {
        return new UserId(value);
    }

    /**
     * Cria um UserId temporário.
     *
     * O banco de dados será responsável por gerar
     * o ID definitivo durante a persistência.
     */
    public static temporary(): UserId {
        return new UserId(0);
    }

    /**
     * Verifica se o ID já foi persistido.
     */
    public isPersisted(): boolean {
        return this.value > 0;
    }

    /**
     * Verifica se o ID ainda é temporário.
     */
    public isTemporary(): boolean {
        return this.value === 0;
    }

    public getValue(): number {
        return this.value;
    }

    public equals(
        other: UserId,
    ): boolean {
        return (
            this.value ===
            other.value
        );
    }

    public toString(): string {
        return this.value.toString();
    }
}