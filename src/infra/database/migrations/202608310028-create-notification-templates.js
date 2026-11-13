"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("notification_templates", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
        unique: true,
      },

      type: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      title_template: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      message_template: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      html_template: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      variables: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
      },

      status: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de TemplateStatus
          "ACTIVE",
          "INACTIVE"
        ),
        allowNull: false,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "notification_templates",
      ["name"],
      {
        unique: true,
        name: "uq_notification_templates_name",
      }
    );

    await queryInterface.addIndex(
      "notification_templates",
      ["type"],
      {
        name: "idx_notification_templates_type",
      }
    );

    await queryInterface.addIndex(
      "notification_templates",
      ["status"],
      {
        name: "idx_notification_templates_status",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("notification_templates");
  },
};