"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tasks", {
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
      // TASK INFORMATION
      // ============================================================

      title: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "TODO",
      },

      priority: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "MEDIUM",
      },

      dueDate: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // ============================================================
      // RELATIONSHIPS
      // ============================================================

      departmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // A base permite null para que a remoção dura de um utilizador
      // torne a tarefa "sem responsável" em vez de a apagar (SET NULL).
      assigneeId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      // ============================================================
      // TIMESTAMPS
      // ============================================================

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex("tasks", ["departmentId"], {
      name: "idx_tasks_department_id",
    });

    await queryInterface.addIndex("tasks", ["assigneeId"], {
      name: "idx_tasks_assignee_id",
    });

    await queryInterface.addIndex("tasks", ["status"], {
      name: "idx_tasks_status",
    });

    await queryInterface.addIndex("tasks", ["dueDate"], {
      name: "idx_tasks_due_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tasks");
  },
};
