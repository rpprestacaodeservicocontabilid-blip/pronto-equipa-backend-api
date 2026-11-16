import { ENV } from '../../config/env';

import { AuthAccountModel } from '../../modules/auth/infrastructure/persistence/models/auth-account.model';
import { SessionModel } from '../../modules/auth/infrastructure/persistence/models/session.model';
import { JwtTokenService } from '../../modules/auth/infrastructure/service/jwt-token.service';
import { UserModel } from '../../modules/user/infrastructure/persistence/models/user.model';
import { RoleModel } from '../../modules/user/infrastructure/persistence/models/role.model';
import { UserRoleModel } from '../../modules/auth/infrastructure/persistence/models/user-role.model';

/** Utilizador autenticado de teste, com token e sessão activos. */
export interface TestActor {
  userId: number;
  accountId: number;
  sessionId: number;
  /** Access token JWT (curta duração). */
  token: string;
  /** Valor do header `Authorization`. */
  authorization: string;
}

export interface CreateActorOptions {
  name?: string;
  email?: string;
  /**
   * Roles GLOBAIS colocadas nas claims do JWT (`user_roles`).
   * Nunca conferem permissões por empresa — o RBAC contextual
   * (módulo authorization) ignora estas claims.
   */
  roles?: string[];
  /** Permissões globais nas claims do JWT (legado do módulo auth). */
  permissions?: string[];
}

let actorSequence = 0;

/**
 * Cria um utilizador + conta + sessão ACTIVA e emite um access token.
 *
 * A sessão é obrigatória: o `authenticationMiddleware` valida o JWT
 * e depois a sessão (`status === "ACTIVE"`, não expirada e pertencente
 * ao `userId` do token).
 */
export async function createActor(options: CreateActorOptions = {}): Promise<TestActor> {
  actorSequence += 1;

  const email = options.email ?? `actor-${Date.now()}-${actorSequence}@prontoequipas.test`;

  const user = await UserModel.create({
    name: options.name ?? `Actor ${actorSequence}`,
    email,
    type: 'PLAYER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  });

  for (const roleName of options.roles ?? []) {
    const [role] = await RoleModel.findOrCreate({
      where: { name: roleName, companyId: null },
      defaults: {
        name: roleName,
        description: null,
        isSystem: true,
        companyId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await UserRoleModel.create({
      userId: user.id,
      roleId: role.id,
      createdAt: new Date(),
    });
  }

  const account = await AuthAccountModel.create({
    userId: user.id,
    provider: 'local',
    providerAccountId: null,
    email,
    passwordHash: null,
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  });

  const now = new Date();

  const session = await SessionModel.create({
    authAccountId: account.id,
    refreshTokenId: null,
    status: 'ACTIVE',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    deviceId: null,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    lastActivityAt: now,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const tokenService = new JwtTokenService(ENV.JWT.SECRET, '15m');

  const { token } = await tokenService.generateAccessToken({
    userId: user.id,
    sessionId: session.id,
    roles: options.roles ?? [],
    permissions: options.permissions ?? [],
  });

  return {
    userId: user.id,
    accountId: account.id,
    sessionId: session.id,
    token,
    authorization: `Bearer ${token}`,
  };
}
