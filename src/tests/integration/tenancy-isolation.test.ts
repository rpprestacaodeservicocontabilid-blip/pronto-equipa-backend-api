import request from 'supertest';

import { app } from '../../main/app';
import { createActor, TestActor } from '../support/auth';
import { resetTestDatabase } from '../support/database';

jest.setTimeout(60_000);

const auth = (actor: TestActor): [string, string] => ['Authorization', actor.authorization];

const tenant = (companyId: number | string): [string, string] => [
  'X-Company-Id',
  String(companyId),
];

interface CompanySummary {
  id: number;
  name: string;
  slug: string;
  status: string;
}

interface MemberRow {
  id: number;
  userId: number;
  roleId: number;
  status: string;
  roleName: string | null;
  userName: string | null;
}

interface AuditRow {
  id: number;
  companyId: number | null;
  actorUserId: number | null;
  action: string;
  entityType: string;
}

/**
 * Isolamento multiempresa (tenant) — Fase 1.
 *
 * O isolamento é feito À APLICAÇÃO (coluna `companyId` + filtros
 * obrigatórios nos repositórios): não há RLS porque não há
 * PostgreSQL. Estas suítes verificam que o âmbito nunca é inferido
 * do body/query do cliente e que as falhas de tenant devolvem
 * sempre a MESMA resposta 403 (anti-enumeration).
 */
describe('Tenancy — isolamento entre empresas', () => {
  let alice: TestActor;
  let bruno: TestActor;
  let carla: TestActor;

  let companyA: CompanySummary;
  let companyB: CompanySummary;

  beforeAll(async () => {
    await resetTestDatabase();

    alice = await createActor({ name: 'Alice' });
    bruno = await createActor({ name: 'Bruno' });
    carla = await createActor({ name: 'Carla' });

    const createdA = await request(app)
      .post('/api/v1/companies')
      .set(...auth(alice))
      .send({ name: 'Empresa Alpha' });

    expect(createdA.status).toBe(201);
    companyA = createdA.body.data as CompanySummary;

    const createdB = await request(app)
      .post('/api/v1/companies')
      .set(...auth(bruno))
      .send({ name: 'Empresa Beta' });

    expect(createdB.status).toBe(201);
    companyB = createdB.body.data as CompanySummary;

    // Carla passa a membro da empresa A (papel ADMIN).
    const roles = await request(app)
      .get('/api/v1/company/roles')
      .set(...auth(alice))
      .set(...tenant(companyA.id));

    expect(roles.status).toBe(200);

    const adminRole = (roles.body.data as Array<{ id: number; name: string }>).find(
      (role) => role.name === 'ADMIN',
    );

    expect(adminRole).toBeDefined();

    const added = await request(app)
      .post('/api/v1/company/membros')
      .set(...auth(alice))
      .set(...tenant(companyA.id))
      .send({ userId: carla.userId, roleId: adminRole!.id });

    expect(added.status).toBe(201);
  });

  it('o admin vê o contexto da própria empresa', async () => {
    const res = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(alice))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.company.id).toBe(companyA.id);
    expect(res.body.data.membership.status).toBe('ACTIVE');
    expect(res.body.data.permissions).toEqual(
      expect.arrayContaining(['company.read', 'audit.read']),
    );
  });

  it('membro de outra empresa é recusado com 403 uniforme', async () => {
    const res = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(bruno))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Access denied.');
  });

  it('empresa inexistente e empresa alheia devolvem a mesma resposta', async () => {
    const alien = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(bruno))
      .set(...tenant(companyA.id));

    const missing = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(bruno))
      .set(...tenant(999_999));

    expect(alien.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(missing.body.error.message).toBe(alien.body.error.message);
    expect(missing.body.error.message).toBe('Access denied.');
  });

  it('sem header de tenant o acesso é recusado', async () => {
    const res = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(alice));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Access denied.');
  });

  it('resolve o tenant também por query string (?companyId=)', async () => {
    const res = await request(app)
      .get(`/api/v1/company/context?companyId=${companyA.id}`)
      .set(...auth(alice));

    expect(res.status).toBe(200);
    expect(res.body.data.company.id).toBe(companyA.id);
  });

  it('cada utilizador só lista as próprias empresas', async () => {
    const mine = await request(app)
      .get('/api/v1/companies')
      .set(...auth(alice));

    expect(mine.status).toBe(200);
    expect((mine.body.data as CompanySummary[]).map((c) => c.id)).toEqual([companyA.id]);

    const theirs = await request(app)
      .get('/api/v1/companies')
      .set(...auth(bruno));

    expect(theirs.status).toBe(200);
    expect((theirs.body.data as CompanySummary[]).map((c) => c.id)).toEqual([companyB.id]);
  });

  it('a listagem de membros só devolve membros do tenant', async () => {
    const res = await request(app)
      .get('/api/v1/company/membros')
      .set(...auth(alice))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(200);

    const rows = res.body.data as MemberRow[];
    const userIds = rows.map((row) => row.userId).sort((a, b) => a - b);

    expect(userIds).toEqual([alice.userId, carla.userId].sort((a, b) => a - b));
    expect(rows.some((row) => row.userId === bruno.userId)).toBe(false);
    expect(rows.every((row) => row.status === 'ACTIVE')).toBe(true);
  });

  it('o contexto de outra empresa não autoriza alterações', async () => {
    const res = await request(app)
      .patch('/api/v1/company')
      .set(...auth(bruno))
      .set(...tenant(companyA.id))
      .send({ name: 'Empresa Hackeada' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Access denied.');

    const context = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(alice))
      .set(...tenant(companyA.id));

    expect(context.body.data.company.name).toBe('Empresa Alpha');
  });

  it('o trilho de auditoria está isolado por empresa', async () => {
    const res = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(alice))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(200);

    const rows = res.body.data as AuditRow[];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.companyId === companyA.id)).toBe(true);
    expect(rows.some((row) => row.action === 'company.created')).toBe(true);

    const denied = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(bruno))
      .set(...tenant(companyA.id));

    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toBe('Access denied.');
  });
});
