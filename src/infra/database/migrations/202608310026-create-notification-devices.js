"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("notification_devices", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      platform: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de DevicePlatform
          "ANDROID",
          "IOS",
          "WEB"
        ),
        allowNull: false,
      },

      device_token: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },

      device_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      device_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      app_version: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    // Um utilizador não pode registar o mesmo token duas vezes
    await queryInterface.addIndex(
      "notification_devices",
      ["user_id", "device_token"],
      {
        unique: true,
        name: "uq_notification_devices_user_token",
      }
    );

    // Consulta rápida dos dispositivos ativos de um utilizador
    await queryInterface.addIndex(
      "notification_devices",
      ["user_id", "is_active"],
      {
        name: "idx_notification_devices_user_active",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("notification_devices");
  },
};