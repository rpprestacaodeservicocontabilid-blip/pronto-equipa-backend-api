"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("notifications", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      recipient_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      recipient_type: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de RecipientType
          "USER",
          "TEAM"
        ),
        allowNull: false,
      },

      type: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de NotificationType
          "SYSTEM",
          "MATCH",
          "MESSAGE"
        ),
        allowNull: false,
      },

      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      priority: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de NotificationPriority
          "LOW",
          "NORMAL",
          "HIGH",
          "URGENT"
        ),
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM(
          // Substituir pelos valores reais de NotificationStatus
          "PENDING",
          "SENT",
          "READ",
          "CANCELLED"
        ),
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
        allowNull: true,
      },

      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      scheduled_at: {
        type: Sequelize.DATE,
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

      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      cancelled_at: {
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

    await queryInterface.addIndex("notifications", ["recipient_id"], {
      name: "idx_notifications_recipient",
    });

    await queryInterface.addIndex(
      "notifications",
      ["recipient_id", "status"],
      {
        name: "idx_notifications_recipient_status",
      }
    );

    await queryInterface.addIndex("notifications", ["type"], {
      name: "idx_notifications_type",
    });

    await queryInterface.addIndex("notifications", ["scheduled_at"], {
      name: "idx_notifications_scheduled_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("notifications");
  },
};