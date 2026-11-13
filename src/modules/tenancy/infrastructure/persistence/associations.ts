import { CompanyModel } from "./model/company.model";
import { CompanyMemberModel } from "./model/company-member.model";
import { UserModel } from "../../../user/infrastructure/persistence/models/user.model";
import { RoleModel } from "../../../user/infrastructure/persistence/models/role.model";

/**
 * Associações do módulo tenancy.
 *
 * Idempotente: pode ser importada mais do que uma vez — o Sequelize
 * ignora associações repetidas com a mesma configuração.
 */
export const setupTenancyAssociations = (): void => {
    CompanyModel.hasMany(CompanyMemberModel, {
        foreignKey: "companyId",
        as: "members",
        onDelete: "CASCADE",
    });

    CompanyMemberModel.belongsTo(CompanyModel, {
        foreignKey: "companyId",
        as: "company",
    });

    CompanyMemberModel.belongsTo(UserModel, {
        foreignKey: "userId",
        as: "user",
    });

    CompanyMemberModel.belongsTo(RoleModel, {
        foreignKey: "roleId",
        as: "role",
    });
};

setupTenancyAssociations();
