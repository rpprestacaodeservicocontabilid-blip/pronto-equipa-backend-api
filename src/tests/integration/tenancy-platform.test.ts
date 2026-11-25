jest.mock('../../infra/database/sequelize', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

import request from 'supertest';
import { sequelize } from '../../infra/database';
import { app } from '../../main/app';
import { createActor } from '../support/auth';
import { resetTestDatabase } from '../support/database';

describe('Tenancy platform administration', () => {
  beforeAll(resetTestDatabase, 60_000);
  afterAll(() => sequelize.close());

  it('filters companies, scopes memberships and applies lifecycle changes to one company', async () => {
    const platform = await createActor({ roles: ['SUPER_ADMIN'] });
    const alice = await createActor({ name: 'Alice' });
    const bob = await createActor({ name: 'Bob' });
    const base = '/api/v1/platform/companies';

    const first = await request(app).post('/api/v1/companies')
      .set('Authorization', alice.authorization).send({ name: 'Alpha Company' }).expect(201);
    const second = await request(app).post('/api/v1/companies')
      .set('Authorization', bob.authorization).send({ name: 'Beta Company' }).expect(201);
    const id: number = first.body.data.id;
    const company = base + '/' + id;

    await request(app).get(base + '/summary').set('Authorization', alice.authorization).expect(403);
    await request(app).get(company + '/members').set('Authorization', alice.authorization).expect(403);
    await request(app).patch(company).set('Authorization', alice.authorization).send({ nif: '12345' }).expect(403);
    await request(app).get(company).set('Authorization', platform.authorization).expect(200);
    await request(app).get(base + '/99999').set('Authorization', platform.authorization).expect(404);

    const members = await request(app).get(company + '/members').set('Authorization', platform.authorization).expect(200);
    expect(members.body.data.map((member: { userId: number }) => member.userId)).toEqual([alice.userId]);

    await request(app).patch(company).set('Authorization', platform.authorization)
      .send({ name: 'Alpha Updated', nif: '12345' }).expect(200);
    const active = await request(app).get(base).query({ search: 'ALPHA UPDATED', status: 'ACTIVE' })
      .set('Authorization', platform.authorization).expect(200);
    expect(active.body.data.map((row: { id: number }) => row.id)).toEqual([id]);

    await request(app).patch(company + '/suspend').set('Authorization', platform.authorization)
      .send({ reason: 'Reviewed by platform team' }).expect(200);
    const summary = await request(app).get(base + '/summary').set('Authorization', platform.authorization).expect(200);
    expect(summary.body.data).toEqual({ total: 2, active: 1, suspended: 1 });
    const suspended = await request(app).get(base).query({ status: 'SUSPENDED' })
      .set('Authorization', platform.authorization).expect(200);
    expect(suspended.body.data.map((row: { id: number }) => row.id)).toEqual([id]);

    await request(app).get('/api/v1/company/context').set('Authorization', alice.authorization)
      .set('X-Company-Id', String(id)).expect(403);
    await request(app).get('/api/v1/company/context').set('Authorization', bob.authorization)
      .set('X-Company-Id', String(second.body.data.id)).expect(200);

    await request(app).patch(company + '/activate').set('Authorization', platform.authorization)
      .send({ reason: 'Access review completed' }).expect(200);
    await request(app).get('/api/v1/company/context').set('Authorization', alice.authorization)
      .set('X-Company-Id', String(id)).expect(200);
  }, 60_000);
});
