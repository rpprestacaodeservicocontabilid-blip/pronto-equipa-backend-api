import { AuthAccountModel } from "./auth-account.model";
import { SessionModel } from "./session.model";
import { RefreshTokenModel } from "./refresh-token.model";
import { VerificationTokenModel } from "./verification-token.model";
import { PasswordResetTokenModel } from "./password-reset-token.model";
import { RoleModel } from "./role.model";
import { PermissionModel } from "./permission.model";
import { UserRoleModel } from "./user-role.model";
import { RolePermissionModel } from "./role-permission.model";

export const setupAuthAssociations = (): void => {
  AuthAccountModel.hasMany(SessionModel, {
    foreignKey: "authAccountId",
  });

  SessionModel.belongsTo(AuthAccountModel, {
    foreignKey: "authAccountId",
  });

  AuthAccountModel.hasMany(RefreshTokenModel, {
    foreignKey: "authAccountId",
  });

  RefreshTokenModel.belongsTo(AuthAccountModel, {
    foreignKey: "authAccountId",
  });

  AuthAccountModel.hasMany(VerificationTokenModel, {
    foreignKey: "authAccountId",
  });

  VerificationTokenModel.belongsTo(AuthAccountModel, {
    foreignKey: "authAccountId",
  });

  AuthAccountModel.hasMany(PasswordResetTokenModel, {
    foreignKey: "authAccountId",
  });

  PasswordResetTokenModel.belongsTo(AuthAccountModel, {
    foreignKey: "authAccountId",
  });

  UserRoleModel.belongsTo(RoleModel, {
    foreignKey: "roleId",
  });

  RoleModel.hasMany(UserRoleModel, {
    foreignKey: "roleId",
  });

  RolePermissionModel.belongsTo(RoleModel, {
    foreignKey: "roleId",
  });

  RoleModel.hasMany(RolePermissionModel, {
    foreignKey: "roleId",
  });

  RolePermissionModel.belongsTo(PermissionModel, {
    foreignKey: "permissionId",
  });

  PermissionModel.hasMany(RolePermissionModel, {
    foreignKey: "permissionId",
  });
};