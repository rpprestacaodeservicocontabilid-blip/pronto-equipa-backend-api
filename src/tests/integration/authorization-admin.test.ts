jest.mock('../../infra/database/sequelize', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

import request from 'supertest';
import { sequelize } from '../../infra/database';
import { app } from '../../main/app';
import { RoleModel } from '../../modules/user/infrastructure/persistence/models/role.model';
import { PermissionModel } from '../../modules/user/infrastructure/persistence/models/permission.model';
import { createActor } from '../support/auth';
import { resetTestDatabase } from '../support/database';

describe('Authorization platform console', () => {
  beforeAll(resetTestDatabase, 60_000);
  afterAll(() => sequelize.close());

  it('restricts the console to platform administrators and evaluates the selected company context', async () => {
    const superAdmin = await createActor({ roles: ['SUPER_ADMIN'] });
    const member = await createActor({ roles: ['ADMIN'] });
    const other = await createActor();
    const base = '/api/v1/authorization/admin';
    const platform = ['Authorization', superAdmin.authorization] as const;

    await request(app).get(base + '/overview').expect(401);
    await request(app).get(base + '/overview').set('Authorization', member.authorization).expect(403);
    await request(app).get(base + '/overview').set(...platform).expect(200);

    const first = await request(app).post('/api/v1/companies').set('Authorization', member.authorization)
      .send({ name: 'Assigned Company' }).expect(201);
    const second = await request(app).post('/api/v1/companies').set('Authorization', other.authorization)
      .send({ name: 'Unassigned Company' }).expect(201);
    const companyId: number = first.body.data.id;
    const otherCompanyId: number = second.body.data.id;
    const otherRole = await RoleModel.create({ name: 'Other Company Role', companyId: otherCompanyId });
    const roles = await request(app).get(base + '/roles').set(...platform).query({ companyId }).expect(200);
    expect(roles.body.data.items.map((role: { id: number }) => role.id)).not.toContain(otherRole.id);

    const permissions = await request(app).get(base + '/permissions').set(...platform)
      .query({ scope: 'TENANT', search: 'COMPANY.READ' }).expect(200);
    const permission = permissions.body.data.items.find((item: { name: string }) => item.name === 'company.read');
    expect(permission).toBeDefined();

    const lookup = await request(app).get(base + '/users/' + member.userId + '/access').set(...platform)
      .query({ companyId }).expect(200);
    expect(lookup.body.data.membershipStatus).toBe('ACTIVE');

    const input = { userId: member.userId, permissionId: permission.id, companyId };
    const allowed = await request(app).post(base + '/simulate').set(...platform).send(input).expect(200);
    expect(allowed.body.data).toMatchObject({ allowed: true, permission: 'company.read', scope: 'TENANT' });
    const denied = await request(app).post(base + '/simulate').set(...platform)
      .send({ ...input, companyId: otherCompanyId }).expect(200);
    expect(denied.body.data.allowed).toBe(false);

    const colonCode = await PermissionModel.create({
      name: 'authorization:test:read', scope: 'TENANT', resource: 'authorization', action: 'read',
    });
    await request(app).post(base + '/simulate').set(...platform)
      .send({ ...input, permissionId: colonCode.id }).expect(400);
  }, 60_000);
});
