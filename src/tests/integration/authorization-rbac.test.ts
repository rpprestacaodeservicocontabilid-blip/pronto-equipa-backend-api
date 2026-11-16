import request from 'supertest';

import { app } from '../../main/app';
import { createActor, TestActor } from '../support/auth';
import { resetTestDatabase } from '../support/database';
import { UserRoleModel } from '../../modules/auth/infrastructure/persistence/models/user-role.model';
import { PermissionModel } from '../../modules/user/infrastructure/persistence/models/permission.model';

jest.setTimeout(60_000);

const auth = (actor: TestActor): [string, string] => ['Authorization', actor.authorization];

const tenant = (companyId: number | string): [string, string] => [
  'X-Company-Id',
  String(companyId),
];

interface CompanySummary {
  id: number;
  name: string;
}

interface RoleView {
  id: number;
  name: string;
  isSystem: boolean;
  companyId: number | null;
  permissionNames: string[];
}

interface MemberRow {
  id: number;
  userId: number;
  roleId: number;
  status: string;
}

/**
 * RBAC — Fase 1.
 *
 * Duas camadas, por esta ordem:
 *
 *  1. `requirePlatformRole` — roles GLOBAIS do JWT (`/platform`),
 *     sem bypass para ADMIN;
 *  2. `requireCompanyPermission` — permissão do papel exercido DENTRO
 *     da empresa (via `company_members.roleId → role_permissions →
 *     permissions`), também sem bypass para ADMIN.
 *
 * Toda a falha contextual devolve 403 com a MESMA mensagem.
 */
describe('Authorization — RBAC contextual', () => {
  let alice: TestActor;
  let bob: TestActor;
  let outsider: TestActor;
  let superAdmin: TestActor;

  let companyA: CompanySummary;
  let receptionRole: RoleView;

  const denied = { message: 'Access denied.', code: 'FORBIDDEN' };

  beforeAll(async () => {
    await resetTestDatabase();

    alice = await createActor({ name: 'Alice' });
    bob = await createActor({ name: 'Bob' });
    outsider = await createActor({
      name: 'Outsider',
      roles: ['ADMIN'],
      permissions: ['audit.read'],
    });
    superAdmin = await createActor({
      name: 'Super',
      roles: ['SUPER_ADMIN'],
    });

    const created = await request(app)
      .post('/api/v1/companies')
      .set(...auth(alice))
      .send({ name: 'Empresa Alpha' });

    expect(created.status).toBe(201);
    companyA = created.body.data as CompanySummary;

    // Papel próprio da empresa com UMA única permissão.
    const role = await request(app)
      .post('/api/v1/company/roles')
      .set(...auth(alice))
      .set(...tenant(companyA.id))
      .send({
        name: 'Rececionista',
        description: 'Apenas consulta.',
        permissionNames: ['company.read'],
      });

    expect(role.status).toBe(201);
    receptionRole = role.body.data as RoleView;
    expect(receptionRole.permissionNames).toEqual(['company.read']);

    const added = await request(app)
      .post('/api/v1/company/membros')
      .set(...auth(alice))
      .set(...tenant(companyA.id))
      .send({ userId: bob.userId, roleId: receptionRole.id });

    expect(added.status).toBe(201);
  });

  it('exige autenticação', async () => {
    const res = await request(app)
      .get('/api/v1/company/context')
      .set('X-Company-Id', String(companyA.id));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required.');
  });

  it('rejeita um token inválido', async () => {
    const res = await request(app)
      .get('/api/v1/company/context')
      .set('Authorization', 'Bearer not-a-real-token')
      .set('X-Company-Id', String(companyA.id));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired token.');
  });

  it('membro sem a permissão é recusado com 403 uniforme', async () => {
    const res = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(bob))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(denied.message);
    expect(res.body.error.code).toBe(denied.code);
  });

  it('membro com a permissão tem acesso', async () => {
    const res = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(alice))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('falha de permissão e falha de tenant são indistinguíveis', async () => {
    // Falha de permissão: membro sem `audit.read`.
    const noPermission = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(bob))
      .set(...tenant(companyA.id));

    // Falha de tenant: nem sequer é membro da empresa.
    const noMembership = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(outsider))
      .set(...tenant(companyA.id));

    expect(noPermission.status).toBe(403);
    expect(noMembership.status).toBe(403);
    expect(noMembership.body.error.message).toBe(noPermission.body.error.message);
    expect(noMembership.body.error.code).toBe(noPermission.body.error.code);
  });

  it('role global ADMIN nas claims não dá acesso sem membership', async () => {
    const context = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(outsider))
      .set(...tenant(companyA.id));

    expect(context.status).toBe(403);
    expect(context.body.error.message).toBe(denied.message);

    const audit = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(outsider))
      .set(...tenant(companyA.id));

    expect(audit.status).toBe(403);
    expect(audit.body.error.message).toBe(denied.message);
  });

  it('conceder a permissão ao papel abre o acesso', async () => {
    const updated = await request(app)
      .put(`/api/v1/company/roles/${receptionRole.id}/permissions`)
      .set(...auth(alice))
      .set(...tenant(companyA.id))
      .send({ permissionNames: ['company.read', 'audit.read'] });

    expect(updated.status).toBe(200);
    expect(updated.body.data.permissionNames).toEqual(
      expect.arrayContaining(['company.read', 'audit.read']),
    );

    const res = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(bob))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(200);
  });

  it('revogar a permissão volta a fechar o acesso', async () => {
    const updated = await request(app)
      .put(`/api/v1/company/roles/${receptionRole.id}/permissions`)
      .set(...auth(alice))
      .set(...tenant(companyA.id))
      .send({ permissionNames: ['company.read'] });

    expect(updated.status).toBe(200);
    expect(updated.body.data.permissionNames).toEqual(['company.read']);

    const res = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(bob))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(denied.message);
  });

  it('não permite atribuir uma permissão exclusiva da plataforma a um papel empresarial', async () => {
    await PermissionModel.create({
      name: 'platform.billing.manage',
      description: 'Permissão administrativa.',
      resource: 'platform.billing',
      action: 'manage',
      scope: 'PLATFORM',
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(app)
      .put(`/api/v1/company/roles/${receptionRole.id}/permissions`)
      .set(...auth(alice))
      .set(...tenant(companyA.id))
      .send({ permissionNames: ['company.read', 'platform.billing.manage'] });

    expect(response.status).toBe(400);

    const stillDenied = await request(app)
      .get('/api/v1/company/audit-logs')
      .set(...auth(bob))
      .set(...tenant(companyA.id));
    expect(stillDenied.status).toBe(403);
  });

  it('/platform exige SUPER_ADMIN e não faz bypass de ADMIN', async () => {
    const withAdmin = await request(app)
      .get('/api/v1/platform/companies')
      .set(...auth(outsider));

    expect(withAdmin.status).toBe(403);
    expect(withAdmin.body.error.message).toBe(denied.message);

    const withSuperAdmin = await request(app)
      .get('/api/v1/platform/companies')
      .set(...auth(superAdmin));

    expect(withSuperAdmin.status).toBe(200);
    expect(withSuperAdmin.body.success).toBe(true);
    expect(withSuperAdmin.body.pagination).toBeDefined();
  });

  it('membro suspenso perde o acesso ao tenant', async () => {
    const members = await request(app)
      .get('/api/v1/company/membros')
      .set(...auth(alice))
      .set(...tenant(companyA.id));

    expect(members.status).toBe(200);

    const bobMember = (members.body.data as MemberRow[]).find((row) => row.userId === bob.userId);

    expect(bobMember).toBeDefined();

    const suspended = await request(app)
      .patch(`/api/v1/company/membros/${bobMember!.id}`)
      .set(...auth(alice))
      .set(...tenant(companyA.id))
      .send({ status: 'SUSPENDED' });

    expect(suspended.status).toBe(200);

    const res = await request(app)
      .get('/api/v1/company/context')
      .set(...auth(bob))
      .set(...tenant(companyA.id));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(denied.message);
  });

  it('papel de plataforma revogado deixa de autorizar uma sessão ainda activa', async () => {
    await UserRoleModel.destroy({
      where: { userId: superAdmin.userId },
    });

    const res = await request(app)
      .get('/api/v1/platform/companies')
      .set(...auth(superAdmin));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(denied.message);
  });
});
