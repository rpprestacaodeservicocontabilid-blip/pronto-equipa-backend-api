"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("notification_deliveries", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      notification_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      channel: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de NotificationChannel
          "EMAIL",
          "SMS",
          "PUSH",
          "WHATSAPP"
        ),
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de DeliveryStatus
          "PENDING",
          "SENT",
          "DELIVERED",
          "FAILED"
        ),
        allowNull: false,
      },

      recipient_address: {
        type: Sequelize.STRING(320),
        allowNull: false,
      },

      provider: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      external_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      attempt: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      error_code: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      delivered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      failed_at: {
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

    await queryInterface.addIndex(
      "notification_deliveries",
      ["notification_id"],
      {
        name: "idx_notification_deliveries_notification",
      }
    );

    await queryInterface.addIndex(
      "notification_deliveries",
      ["notification_id", "channel"],
      {
        name: "idx_notification_deliveries_notification_channel",
      }
    );

    await queryInterface.addIndex(
      "notification_deliveries",
      ["status"],
      {
        name: "idx_notification_deliveries_status",
      }
    );

    await queryInterface.addIndex(
      "notification_deliveries",
      ["external_id"],
      {
        name: "idx_notification_deliveries_external_id",
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("notification_deliveries");

    // Necessário para PostgreSQL
    if (queryInterface.sequelize.getDialect() === "postgres") {
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_notification_deliveries_channel";'
      );

      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_notification_deliveries_status";'
      );
    }
  },
};