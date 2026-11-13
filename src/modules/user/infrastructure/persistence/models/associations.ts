import { UserModel } from "./user.model";
import { UserProfileModel } from "./user-profile.model";
import { RoleModel } from "./role.model";
import { PermissionModel } from "./permission.model";
import { UserRoleModel } from "./user-role.model";
import { RolePermissionModel } from "./role-permission.model";
import { UserPermissionModel } from "./user-permission.model";

UserModel.hasOne(
  UserProfileModel,
  {
    foreignKey: "userId",
    as: "profile",
    onDelete: "CASCADE",
  },
);

UserProfileModel.belongsTo(
  UserModel,
  {
    foreignKey: "userId",
    as: "user",
  },
);

UserModel.belongsToMany(
  RoleModel,
  {
    through: UserRoleModel,
    foreignKey: "userId",
    otherKey: "roleId",
    as: "roles",
  },
);

RoleModel.belongsToMany(
  UserModel,
  {
    through: UserRoleModel,
    foreignKey: "roleId",
    otherKey: "userId",
    as: "users",
  },
);

RoleModel.belongsToMany(
  PermissionModel,
  {
    through: RolePermissionModel,
    foreignKey: "roleId",
    otherKey: "permissionId",
    as: "permissions",
  },
);

PermissionModel.belongsToMany(
  RoleModel,
  {
    through: RolePermissionModel,
    foreignKey: "permissionId",
    otherKey: "roleId",
    as: "roles",
  },
);

UserModel.belongsToMany(
  PermissionModel,
  {
    through: UserPermissionModel,
    foreignKey: "userId",
    otherKey: "permissionId",
    as: "directPermissions",
  },
);

PermissionModel.belongsToMany(
  UserModel,
  {
    through: UserPermissionModel,
    foreignKey: "permissionId",
    otherKey: "userId",
    as: "users",
  },
);