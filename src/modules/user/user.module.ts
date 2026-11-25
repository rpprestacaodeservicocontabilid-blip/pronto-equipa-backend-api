import { SessionManagerService } from '../auth/infrastructure/service/session-manager.service';
import { createUserRecentRoutes } from './presentation/routes/user-recent.routes';
import { ListRecentUsersUseCase } from './application/use-cases/list-recent-users.use-case';
import { SequelizeRecentUsersReader } from './infrastructure/persistence/readers/sequelize-recent-users-reader';
import { UserController } from './presentation/controllers/user.controller';
import { ProfileController } from './presentation/controllers/profile.controller';
import { RoleController } from './presentation/controllers/role.controller';
import { PermissionController } from './presentation/controllers/permission.controller';

import { userRoutes } from './presentation/routes/user.routes';
import { profileRoutes } from './presentation/routes/profile.routes';
import { roleRoutes } from './presentation/routes/role.routes';
import { permissionRoutes } from './presentation/routes/permission.routes';

import { SequelizeUserRepository } from './infrastructure/persistence/repositories/sequelize-user.repository';
import { SequelizeUserProfileRepository } from './infrastructure/persistence/repositories/sequelize-user-profile.repository';
import { SequelizeRoleRepository } from './infrastructure/persistence/repositories/sequelize-role.repository';
import { SequelizePermissionRepository } from './infrastructure/persistence/repositories/sequelize-permission.repository';

import { AuthGatewayImpl } from './infrastructure/integrations/auth/auth.gateway.impl';
import { StorageGatewayImpl } from './infrastructure/integrations/storage/storage.gateway.impl';
import { NotificationGatewayImpl } from './infrastructure/integrations/notifications/notification.gateway.impl';

import { TokenServicePort } from '../auth/application/ports/token-service.port';

import { UserProfileServiceImpl } from './infrastructure/services/user-profile.service.impl';
import { UserRoleServiceImpl } from './infrastructure/services/user-role.service.impl';
import { PermissionServiceImpl } from './infrastructure/services/permission.service.impl';
import { UserStatusServiceImpl } from './infrastructure/services/user-status.service.impl';
import { UserValidationServiceImpl } from './infrastructure/services/user-validation.service.impl';

import { UserEventPublisher } from './infrastructure/messaging/user-event.publisher';

import './infrastructure/persistence/models/associations';

import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { GetUserByIdUseCase } from './application/use-cases/get-user-by-id.use-case';
import { GetUserByEmailUseCase } from './application/use-cases/get-user-by-email.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { ActivateUserUseCase } from './application/use-cases/activate-user.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';

import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { GetUserProfileUseCase } from './application/use-cases/get-user-profile.use-case';
import { EnsureProfileUseCase } from './application/use-cases/ensure-profile.use-case';

import { AssignRoleUseCase } from './application/use-cases/assign-role.use-case';
import { RemoveRoleUseCase } from './application/use-cases/remove-role.use-case';
import { GetUserRolesUseCase } from './application/use-cases/get-user-roles.use-case';

import { AssignPermissionUseCase } from './application/use-cases/assign-permission.use-case';
import { RemovePermissionUseCase } from './application/use-cases/remove-permission.use-case';
import { CheckUserPermissionUseCase } from './application/use-cases/check-user-permission.use-case';

// Simple in-memory cache implementation for user operations
class SimpleUserCache {
  private cache = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.cache.get(key) || null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.cache.set(key, value);
    if (ttl) {
      setTimeout(() => this.cache.delete(key), ttl);
    }
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

export interface UserModuleDependencies {
  authGateway: AuthGatewayImpl;
  storageGateway: StorageGatewayImpl;
  notificationGateway: NotificationGatewayImpl;

  eventBus: {
    publish(event: unknown): Promise<void>;

    subscribe(eventName: string, handler: (event: unknown) => Promise<void>): void;
  };

  tokenService: TokenServicePort;
}

export const UserModule = (dependencies: UserModuleDependencies) => {
  /*
   * ============================================================
   * REPOSITORIES
   * ============================================================
   */

  const userRepository = new SequelizeUserRepository();

  const userProfileRepository = new SequelizeUserProfileRepository();

  const roleRepository = new SequelizeRoleRepository();

  const permissionRepository = new SequelizePermissionRepository();

  /*
   * ============================================================
   * GATEWAYS
   * ============================================================
   *
   * Os gateways representam as dependências externas do domínio.
   *
   * Auth
   * Storage
   * Notification
   *
   * são fornecidos pelo composition root da aplicação.
   */

  const { authGateway } = dependencies;

  const { storageGateway } = dependencies;

  const { notificationGateway } = dependencies;

  /*
   * ============================================================
   * SERVICES
   * ============================================================
   */

  const userProfileService = new UserProfileServiceImpl(userProfileRepository, storageGateway);

  const userRoleService = new UserRoleServiceImpl();

  const permissionService = new PermissionServiceImpl();

  const userStatusService = new UserStatusServiceImpl();

  const userValidationService = new UserValidationServiceImpl();

  /*
   * ============================================================
   * EVENT PUBLISHER
   * ============================================================
   */

  const eventPublisher = new UserEventPublisher(dependencies.eventBus);

  /*
   * ============================================================
   * CACHE
   * ============================================================
   */

  const cache = new SimpleUserCache();

  /*
   * ============================================================
   * USER USE CASES
   * ============================================================
   */

  const createUserUseCase = new CreateUserUseCase(
    userRepository,
    userValidationService,
    eventPublisher,
  );

  const getUserByIdUseCase = new GetUserByIdUseCase(userRepository, cache);

  const getUserByEmailUseCase = new GetUserByEmailUseCase(userRepository);

  const updateUserUseCase = new UpdateUserUseCase(
    userRepository,
    userValidationService,
    eventPublisher,
    cache,
  );

  const deleteUserUseCase = new DeleteUserUseCase(userRepository, eventPublisher, cache);

  const activateUserUseCase = new ActivateUserUseCase(userRepository, eventPublisher, cache);

  const deactivateUserUseCase = new DeactivateUserUseCase(userRepository, eventPublisher, cache);

  /*
   * ============================================================
   * PROFILE USE CASES
   * ============================================================
   */

  const updateProfileUseCase = new UpdateProfileUseCase(
    userProfileRepository,
    userProfileService,
    eventPublisher,
    cache,
  );

  const getUserProfileUseCase = new GetUserProfileUseCase(userProfileRepository, cache);

  const ensureProfileUseCase = new EnsureProfileUseCase(userProfileRepository, userRepository);

  /*
   * ============================================================
   * ROLE USE CASES
   * ============================================================
   */

  const assignRoleUseCase = new AssignRoleUseCase(
    userRepository,
    roleRepository,
    userRoleService,
    eventPublisher,
  );

  const removeRoleUseCase = new RemoveRoleUseCase(
    userRepository,
    roleRepository,
    userRoleService,
    eventPublisher,
  );

  const getUserRolesUseCase = new GetUserRolesUseCase(roleRepository);

  /*
   * ============================================================
   * PERMISSION USE CASES
   * ============================================================
   */

  const assignPermissionUseCase = new AssignPermissionUseCase(
    userRepository,
    permissionRepository,
    permissionService,
    eventPublisher,
  );

  const removePermissionUseCase = new RemovePermissionUseCase(
    userRepository,
    permissionRepository,
    permissionService,
    eventPublisher,
  );

  const checkUserPermissionUseCase = new CheckUserPermissionUseCase(
    userRepository,
    permissionRepository,
    permissionService,
  );

  /*
   * ============================================================
   * CONTROLLERS
   * ============================================================
   */

  const userController = new UserController(
    createUserUseCase,
    getUserByIdUseCase,
    getUserByEmailUseCase,
    updateUserUseCase,
    deleteUserUseCase,
    activateUserUseCase,
    deactivateUserUseCase,
  );

  const profileController = new ProfileController(
    updateProfileUseCase,
    getUserProfileUseCase,
    ensureProfileUseCase,
  );

  const roleController = new RoleController(
    assignRoleUseCase,
    removeRoleUseCase,
    getUserRolesUseCase,
  );

  const permissionController = new PermissionController(
    assignPermissionUseCase,
    removePermissionUseCase,
    checkUserPermissionUseCase,
  );

  /*
   * ============================================================
   * ROUTES
   * ============================================================
   */

  const routes = {
    user: userRoutes(userController),

    profile: profileRoutes(
      profileController,
      dependencies.tokenService,
      new SessionManagerService(),
    ),

    role: roleRoutes(roleController),

    permission: permissionRoutes(permissionController),
  };

  /*
   * ============================================================
   * MODULE PUBLIC API
   * ============================================================
   */

  return {
    routes,
    invalidateUser: (id: number) => cache.delete(`user:${id}`),

    controllers: {
      userController,
      profileController,
      roleController,
      permissionController,
    },

    useCases: {
      createUserUseCase,
      getUserByIdUseCase,
      getUserByEmailUseCase,
      updateUserUseCase,
      deleteUserUseCase,
      activateUserUseCase,
      deactivateUserUseCase,

      updateProfileUseCase,
      getUserProfileUseCase,

      assignRoleUseCase,
      removeRoleUseCase,
      getUserRolesUseCase,

      assignPermissionUseCase,
      removePermissionUseCase,
      checkUserPermissionUseCase,
    },

    repositories: {
      userRepository,
      userProfileRepository,
      roleRepository,
      permissionRepository,
    },

    gateways: {
      authGateway,
      storageGateway,
      notificationGateway,
    },

    services: {
      userProfileService,
      userRoleService,
      permissionService,
      userStatusService,
      userValidationService,
    },

    messaging: {
      eventPublisher,
    },
  };
};

export function createRecentUsersModule() {
  return createUserRecentRoutes(new ListRecentUsersUseCase(new SequelizeRecentUsersReader()));
}
