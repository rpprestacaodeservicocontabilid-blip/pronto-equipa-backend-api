import { AuthAccount } from '../../../domain/entities/auth-account.entity';

import { AuthAccountRepository } from '../../../domain/repositories/auth-account.repository';

import { AuthAccountModel } from '../models/auth-account.model';

import { AuthAccountProps } from '../../../domain/entities/auth-account.entity';

import { AuthAccountId } from '../../../domain/value-objects/auth-account-id.vo';

import { Email } from '../../../domain/value-objects/email.vo';

import { Password } from '../../../domain/value-objects/password.vo';

import { AuthProvider } from '../../../domain/enums/auth-provider.enum';

import { AuthStatus } from '../../../domain/enums/auth-status.enum';

export class SequelizeAuthAccountRepository implements AuthAccountRepository {
  // ============================================================
  // SAVE
  // ============================================================

  async save(account: AuthAccount): Promise<AuthAccount> {
    const data = account.toPersistence();

    // --------------------------------------------------------
    // NOVA AUTH ACCOUNT
    // --------------------------------------------------------

    if (data.id === 0) {
      const model = await AuthAccountModel.create({
        userId: data.userId,

        email: data.email,

        /*
         * O domínio chama isto de "password",
         * mas a BD armazena como "passwordHash".
         */
        passwordHash: data.password,

        provider: data.provider,

        providerAccountId: data.providerAccountId,

        status: data.status,

        emailVerifiedAt: data.emailVerifiedAt,

        failedLoginAttempts: data.failedLoginAttempts,

        lockedUntil: data.lockedUntil,

        lastLoginAt: data.lastLoginAt,

        createdAt: data.createdAt,

        updatedAt: data.updatedAt,
      });

      /*
       * O Sequelize acabou de gerar o ID.
       *
       * Reconstituímos a entidade usando
       * os dados reais retornados pela BD.
       */

      return AuthAccount.reconstitute(this.mapToDomain(model));
    }

    // --------------------------------------------------------
    // UPDATE ATRAVÉS DO SAVE
    // --------------------------------------------------------

    const [affectedRows] = await AuthAccountModel.update(
      {
        userId: data.userId,

        email: data.email,

        passwordHash: data.password,

        provider: data.provider,

        providerAccountId: data.providerAccountId,

        status: data.status,

        emailVerifiedAt: data.emailVerifiedAt,

        failedLoginAttempts: data.failedLoginAttempts,

        lockedUntil: data.lockedUntil,

        lastLoginAt: data.lastLoginAt,

        updatedAt: data.updatedAt,
      },

      {
        where: {
          id: data.id,
        },
      },
    );

    if (affectedRows === 0) {
      throw new Error(`Auth account ${data.id} not found.`);
    }

    const model = await AuthAccountModel.findByPk(data.id);

    if (!model) {
      throw new Error('Auth account not found after update.');
    }

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // FIND BY ID
  // ============================================================

  async findById(id: number): Promise<AuthAccount | null> {
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    const model = await AuthAccountModel.findByPk(id);

    if (!model) {
      return null;
    }

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // FIND BY USER ID
  // ============================================================

  async findByUserId(userId: number): Promise<AuthAccount | null> {
    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    const model = await AuthAccountModel.findOne({
      where: {
        userId,
      },
    });

    if (!model) {
      return null;
    }

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // FIND BY EMAIL
  // ============================================================

  async findByEmail(email: string): Promise<AuthAccount | null> {
    if (typeof email !== 'string' || !email.trim()) {
      return null;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const model = await AuthAccountModel.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (!model) {
      return null;
    }

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // FIND BY PROVIDER ACCOUNT
  // ============================================================

  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<AuthAccount | null> {
    if (typeof provider !== 'string' || !provider.trim()) {
      return null;
    }

    if (typeof providerAccountId !== 'string' || !providerAccountId.trim()) {
      return null;
    }

    const model = await AuthAccountModel.findOne({
      where: {
        provider: provider.trim(),

        providerAccountId: providerAccountId.trim(),
      },
    });

    if (!model) {
      return null;
    }

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // EXISTS BY EMAIL
  // ============================================================

  async existsByEmail(email: string): Promise<boolean> {
    const account = await this.findByEmail(email);

    return account !== null;
  }

  // ============================================================
  // FIND BY USER ID AND PROVIDER
  // ============================================================
  async findByUserIdAndProvider(userId: number, provider: string): Promise<AuthAccount | null> {
    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    const model = await AuthAccountModel.findOne({
      where: {
        userId,
        provider,
      },
    });

    if (!model) {
      return null;
    }

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // LINK PROVIDER
  // ============================================================

  async linkProvider(input: {
    userId: number;
    provider: string;
    providerAccountId: string;
    email: string;
  }): Promise<AuthAccount> {
    const model = await AuthAccountModel.findOne({
      where: {
        userId: input.userId,
      },
    });

    if (!model) {
      throw new Error('Authentication account not found.');
    }

    await model.update({
      provider: input.provider,

      providerAccountId: input.providerAccountId,
    });

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // UNLINK PROVIDER
  // ============================================================

  async unlinkProvider(userId: number, provider: string): Promise<void> {
    const model = await AuthAccountModel.findOne({
      where: {
        userId,
        provider,
      },
    });

    if (!model) {
      return;
    }

    await model.update({
      providerAccountId: null,
    });
  }

  // ============================================================
  // CREATE OAUTH ACCOUNT
  // ============================================================

  async createOAuthAccount(input: {
    userId: number;
    email: string;
    provider: string;
    providerAccountId: string;
    emailVerified: boolean;
  }): Promise<AuthAccount> {
    const now = new Date();

    const model = await AuthAccountModel.create({
      userId: input.userId,

      email: input.email.trim().toLowerCase(),

      passwordHash: null,

      provider: input.provider,

      providerAccountId: input.providerAccountId,

      status: input.emailVerified ? AuthStatus.ACTIVE : AuthStatus.PENDING_VERIFICATION,

      emailVerifiedAt: input.emailVerified ? now : null,

      failedLoginAttempts: 0,

      lockedUntil: null,

      lastLoginAt: null,

      createdAt: now,

      updatedAt: now,
    });

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // UPDATE
  // ============================================================

  async update(account: AuthAccount): Promise<AuthAccount> {
    const accountId = account.id.getValue();

    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error('Cannot update an unsaved auth account.');
    }

    const model = await AuthAccountModel.findByPk(accountId);

    if (!model) {
      throw new Error(`Auth account ${accountId} not found.`);
    }

    const data = account.toPersistence();

    await model.update({
      userId: data.userId,

      email: data.email,

      /*
       * Domain:
       * password
       *
       * Database:
       * passwordHash
       */
      passwordHash: data.password,

      provider: data.provider,

      providerAccountId: data.providerAccountId,

      status: data.status,

      emailVerifiedAt: data.emailVerifiedAt,

      failedLoginAttempts: data.failedLoginAttempts,

      lockedUntil: data.lockedUntil,

      lastLoginAt: data.lastLoginAt,

      updatedAt: data.updatedAt,
    });

    /*
     * Retornamos a entidade com os dados
     * efetivamente mantidos pelo Sequelize.
     */

    return AuthAccount.reconstitute(this.mapToDomain(model));
  }

  // ============================================================
  // DELETE
  // ============================================================

  async delete(id: number): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }

    await AuthAccountModel.destroy({
      where: {
        id,
      },
    });
  }

  // ============================================================
  // MAP SEQUELIZE → DOMAIN
  // ============================================================

  private mapToDomain(model: AuthAccountModel): AuthAccountProps {
    return {
      // ----------------------------------------------------
      // ID
      // ----------------------------------------------------

      id: AuthAccountId.create(model.id),

      // ----------------------------------------------------
      // USER
      // ----------------------------------------------------

      userId: model.userId,

      // ----------------------------------------------------
      // EMAIL
      // ----------------------------------------------------

      email: Email.create(model.email),

      // ----------------------------------------------------
      // PASSWORD
      // ----------------------------------------------------

      /*
       * A BD possui passwordHash.
       *
       * O domínio recebe Password.
       */

      password: model.passwordHash ? Password.fromHash(model.passwordHash) : null,

      // ----------------------------------------------------
      // PROVIDER
      // ----------------------------------------------------

      provider: model.provider as AuthProvider,

      providerAccountId: model.providerAccountId ?? null,

      // ----------------------------------------------------
      // STATUS
      // ----------------------------------------------------

      status: model.status as AuthStatus,

      // ----------------------------------------------------
      // ROLES
      // ----------------------------------------------------

      /*
       * Ainda não estamos carregando roles
       * nesta consulta.
       *
       * Podemos implementar posteriormente
       * através de RoleRepository / associação.
       */

      roles: [],

      // ----------------------------------------------------
      // VERIFICAÇÃO DE EMAIL
      // ----------------------------------------------------

      emailVerifiedAt: model.emailVerifiedAt ?? null,

      // ----------------------------------------------------
      // LOGIN / SEGURANÇA
      // ----------------------------------------------------

      failedLoginAttempts: model.failedLoginAttempts,

      lockedUntil: model.lockedUntil ?? null,

      lastLoginAt: model.lastLoginAt ?? null,

      // ----------------------------------------------------
      // TIMESTAMPS
      // ----------------------------------------------------

      createdAt: model.createdAt,

      updatedAt: model.updatedAt,
    };
  }
}
