"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface) {
    // ============================================================
    // DEPARTMENT MEMBERS
    // ============================================================

    await queryInterface.addConstraint("department_members", {
      fields: ["departmentId"],
      type: "foreign key",
      name: "fk_department_members_department_id",
      references: {
        table: "departments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    await queryInterface.addConstraint("department_members", {
      fields: ["userId"],
      type: "foreign key",
      name: "fk_department_members_user_id",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    // ============================================================
    // TASKS
    // ============================================================

    await queryInterface.addConstraint("tasks", {
      fields: ["departmentId"],
      type: "foreign key",
      name: "fk_tasks_department_id",
      references: {
        table: "departments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    await queryInterface.addConstraint("tasks", {
      fields: ["assigneeId"],
      type: "foreign key",
      name: "fk_tasks_assignee_id",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("tasks", "fk_tasks_assignee_id");
    await queryInterface.removeConstraint("tasks", "fk_tasks_department_id");
    await queryInterface.removeConstraint("department_members", "fk_department_members_user_id");
    await queryInterface.removeConstraint("department_members", "fk_department_members_department_id");
  },
};
