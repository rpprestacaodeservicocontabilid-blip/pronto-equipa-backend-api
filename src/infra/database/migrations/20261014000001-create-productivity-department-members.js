"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("department_members", {
      // ============================================================
      // PRIMARY KEY
      // ============================================================

      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      // ============================================================
      // RELATIONSHIPS
      // ============================================================

      departmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ============================================================
      // TIMESTAMPS
      // ============================================================

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex("department_members", ["departmentId"], {
      name: "idx_department_members_department_id",
    });

    await queryInterface.addIndex("department_members", ["userId"], {
      name: "idx_department_members_user_id",
    });

    // Um utilizador só pode pertencer uma vez ao mesmo departamento.
    await queryInterface.addConstraint("department_members", {
      fields: ["departmentId", "userId"],
      type: "unique",
      name: "uq_department_members_department_user",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("department_members");
  },
};
