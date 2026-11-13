import request from "supertest";

import { app } from "../../main/app";
import { createActor, TestActor } from "../support/auth";
import { resetTestDatabase } from "../support/database";

jest.setTimeout(60_000);

const auth = (actor: TestActor): [string, string] => [
    "Authorization",
    actor.authorization,
];

const tenant = (companyId: number | string): [string, string] => [
    "X-Company-Id",
    String(companyId),
];

interface CompanySummary {
    id: number;
    name: string;
}

interface AuditRow {
    id: number;
    companyId: number | null;
    actorUserId: number | null;
    action: string;
    entityType: string;
    entityId: string | null;
    after: Record<string, unknown> | null;
    createdAt: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

/**
 * Auditoria — Fase 1.
 *
 * O trilho é gravado best-effort pós-commit (falhas só loggadas) e
 * consultado SEMPRE com o âmbito do tenant — o repositório exige
 * `companyId` em todas as consultas. Verifica-se aqui que:
 *
 *  - cada empresa só vê os próprios eventos;
 *  - filtros `action` / `entityType` continuam escopados ao tenant;
 *  - quem não é membro recebe o mesmo 403 uniforme;
 *  - os campos do registo (actor, entidade, payload) são úteis para
 *    reconstruir "quem fez o quê".
 */
describe("Audit — trilho de auditoria por empresa", () => {
    let alice: TestActor;
    let bruno: TestActor;
    let carla: TestActor;

    let companyA: CompanySummary;
    let companyB: CompanySummary;

    beforeAll(async () => {
        await resetTestDatabase();

        alice = await createActor({ name: "Alice" });
        bruno = await createActor({ name: "Bruno" });
        carla = await createActor({ name: "Carla" });

        const createdA = await request(app)
            .post("/api/v1/companies")
            .set(...auth(alice))
            .send({ name: "Empresa Alpha" });

        expect(createdA.status).toBe(201);
        companyA = createdA.body.data as CompanySummary;

        const createdB = await request(app)
            .post("/api/v1/companies")
            .set(...auth(bruno))
            .send({ name: "Empresa Beta" });

        expect(createdB.status).toBe(201);
        companyB = createdB.body.data as CompanySummary;

        // Carla entra na empresa A → gera `company.member.added`.
        const roles = await request(app)
            .get("/api/v1/company/roles")
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(roles.status).toBe(200);

        const adminRole = (
            roles.body.data as Array<{ id: number; name: string }>
        ).find((role) => role.name === "ADMIN");

        expect(adminRole).toBeDefined();

        const added = await request(app)
            .post("/api/v1/company/membros")
            .set(...auth(alice))
            .set(...tenant(companyA.id))
            .send({ userId: carla.userId, roleId: adminRole!.id });

        expect(added.status).toBe(201);
    });

    it("grava o evento company.created com actor e entidade", async () => {
        const res = await request(app)
            .get("/api/v1/company/audit-logs?action=company.created")
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const rows = res.body.data as AuditRow[];

        expect(rows).toHaveLength(1);

        const [created] = rows;

        expect(created.companyId).toBe(companyA.id);
        expect(created.actorUserId).toBe(alice.userId);
        expect(created.entityType).toBe("company");
        expect(created.entityId).toBe(String(companyA.id));
        expect(created.after).toMatchObject({ id: companyA.id });
        expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    });

    it("só devolve eventos da própria empresa", async () => {
        const mine = await request(app)
            .get("/api/v1/company/audit-logs?limit=100")
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(mine.status).toBe(200);

        const rows = mine.body.data as AuditRow[];

        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.companyId === companyA.id)).toBe(true);
        // O evento da empresa Beta nunca aparece aqui.
        expect(
            rows.some((row) => row.entityId === String(companyB.id)),
        ).toBe(false);

        const theirs = await request(app)
            .get("/api/v1/company/audit-logs?limit=100")
            .set(...auth(bruno))
            .set(...tenant(companyB.id));

        expect(theirs.status).toBe(200);

        const theirRows = theirs.body.data as AuditRow[];

        expect(theirRows.every((row) => row.companyId === companyB.id)).toBe(
            true,
        );
        expect(
            theirRows.some((row) => row.entityId === String(companyA.id)),
        ).toBe(false);
    });

    it("filtra por action dentro do âmbito do tenant", async () => {
        const res = await request(app)
            .get("/api/v1/company/audit-logs?action=company.member.added")
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(res.status).toBe(200);

        const rows = res.body.data as AuditRow[];

        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.action === "company.member.added")).toBe(
            true,
        );
        expect(
            rows.every((row) => row.entityType === "company_member"),
        ).toBe(true);

        // Nenhuma empresa vê eventos de membros que não são seus.
        const other = await request(app)
            .get("/api/v1/company/audit-logs?action=company.member.added")
            .set(...auth(bruno))
            .set(...tenant(companyB.id));

        expect(other.status).toBe(200);
        expect((other.body.data as AuditRow[])).toHaveLength(0);
    });

    it("filtra por entityType dentro do âmbito do tenant", async () => {
        const res = await request(app)
            .get("/api/v1/company/audit-logs?entityType=company")
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(res.status).toBe(200);

        const rows = res.body.data as AuditRow[];

        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.entityType === "company")).toBe(true);
        expect(rows.every((row) => row.companyId === companyA.id)).toBe(true);
    });

    it("combina filtros e devolve paginação", async () => {
        const res = await request(app)
            .get(
                "/api/v1/company/audit-logs" +
                "?action=company.created&entityType=company&page=1&limit=1",
            )
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(res.status).toBe(200);

        const rows = res.body.data as AuditRow[];
        const pagination = res.body.pagination as Pagination;

        expect(rows).toHaveLength(1);
        expect(rows[0].action).toBe("company.created");
        expect(pagination.page).toBe(1);
        expect(pagination.limit).toBe(1);
        expect(pagination.total).toBe(1);
        expect(pagination.totalPages).toBe(1);
    });

    it("registre um novo evento fica visível no trilho", async () => {
        const updated = await request(app)
            .patch("/api/v1/company")
            .set(...auth(alice))
            .set(...tenant(companyA.id))
            .send({ name: "Empresa Alpha Lda" });

        expect(updated.status).toBe(200);

        const res = await request(app)
            .get("/api/v1/company/audit-logs?action=company.updated")
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(res.status).toBe(200);

        const rows = res.body.data as AuditRow[];

        expect(rows).toHaveLength(1);
        expect(rows[0].actorUserId).toBe(alice.userId);
        expect(rows[0].companyId).toBe(companyA.id);
    });

    it("não-membro recebe o mesmo 403 uniforme", async () => {
        const res = await request(app)
            .get("/api/v1/company/audit-logs")
            .set(...auth(carla))
            .set(...tenant(companyB.id));

        expect(res.status).toBe(403);
        expect(res.body.error.message).toBe("Access denied.");
        expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("sem autenticação devolve 401", async () => {
        const res = await request(app)
            .get("/api/v1/company/audit-logs")
            .set("X-Company-Id", String(companyA.id));

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Authentication required.");
    });

    it("rejeita filtros de data inválidos com 400", async () => {
        const res = await request(app)
            .get("/api/v1/company/audit-logs?from=not-a-date")
            .set(...auth(alice))
            .set(...tenant(companyA.id));

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("BAD_REQUEST");
        expect(res.body.error.message).toBe("Invalid date filter.");
    });
});
