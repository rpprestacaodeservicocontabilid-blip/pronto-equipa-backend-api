"use strict";

const obsoleteRoles = [
  "USER",
  "PLAYER",
  "TEAM_MANAGER",
  "MODERATOR",
  "PLATFORM_MANAGER",
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const assigned = await queryInterface.sequelize.query(
      `SELECT auth_roles.name, COUNT(user_roles.id) AS assignments
       FROM auth_roles
       LEFT JOIN user_roles ON user_roles.roleId = auth_roles.id
       WHERE auth_roles.name IN (:names)
       GROUP BY auth_roles.name
       HAVING COUNT(user_roles.id) > 0`,
      {
        replacements: { names: obsoleteRoles },
        type: Sequelize.QueryTypes.SELECT,
      },
    );

    if (assigned.length > 0) {
      const names = assigned.map((row) => row.name).join(", ");
      throw new Error(
        `Cannot remove obsolete roles that are still assigned (${names}). ` +
        "Reassign those users to TEAM_OWNER, FIELD_OWNER, ORGANIZER, ADMIN or SUPER_ADMIN, then rerun migrations.",
      );
    }

    const staleRoles = await queryInterface.sequelize.query(
      "SELECT id FROM auth_roles WHERE name IN (:names)",
      {
        replacements: { names: obsoleteRoles },
        type: Sequelize.QueryTypes.SELECT,
      },
    );
    const staleIds = staleRoles.map((role) => role.id);

    if (staleIds.length > 0) {
      await queryInterface.bulkDelete(
        "role_permissions",
        { roleId: { [Sequelize.Op.in]: staleIds } },
        {},
      );
    }

    await queryInterface.bulkDelete("roles", { name: { [Sequelize.Op.in]: obsoleteRoles } }, {});
    await queryInterface.bulkDelete("auth_roles", { name: { [Sequelize.Op.in]: obsoleteRoles } }, {});
  },

  async down() {
    throw new Error("Removed role definitions cannot be restored automatically.");
  },
};
