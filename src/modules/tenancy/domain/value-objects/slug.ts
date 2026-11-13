import { BadRequestError } from "../../../../shared/errors/app.error";

/**
 * Value object Slug — identificador URL-safe e estável de uma empresa.
 *
 * Regras:
 *  - minúsculas, apenas letras/números separados por hífen;
 *  - sem hífens no início/fim, sem hífens duplicados;
 *  - máximo de 160 caracteres.
 */
export class Slug {
    private constructor(
        public readonly value: string,
    ) { }

    /** Deriva um slug a partir do nome da empresa. */
    static fromName(name: string): Slug {
        const normalized = String(name ?? "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 160)
            .replace(/-+$/g, "");

        if (!normalized) {
            throw new BadRequestError("Invalid company name.");
        }

        return new Slug(normalized);
    }

    /** Valida um slug fornecido explicitamente pela API. */
    static parse(raw: string): Slug {
        const value = String(raw ?? "").trim().toLowerCase();

        if (
            !value ||
            value.length > 160 ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
        ) {
            throw new BadRequestError("Invalid slug.");
        }

        return new Slug(value);
    }

    /** Gera o próximo candidato com sufixo numérico (ex.: `acme-2`). */
    withSuffix(suffix: number): Slug {
        const base = this.value.slice(0, 150);
        return new Slug(`${base}-${suffix}`);
    }

    equals(other: Slug): boolean {
        return this.value === other.value;
    }
}
