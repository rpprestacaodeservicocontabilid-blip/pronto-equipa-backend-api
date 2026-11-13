export class Phone {
    private constructor(
        private readonly value: string,
    ) { }

    public static create(value: string): Phone {
        const normalized = value
            ?.trim()
            .replace(/\s+/g, "");

        if (!normalized) {
            throw new Error("Phone number is required.");
        }

        if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
            throw new Error(
                "Invalid phone number.",
            );
        }

        return new Phone(normalized);
    }

    public getValue(): string {
        return this.value;
    }

    public equals(other: Phone): boolean {
        return this.value === other.value;
    }

    public toString(): string {
        return this.value;
    }
}