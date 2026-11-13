"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("bookings", {
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

      fieldId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      cityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ============================================================
      // BOOKING PERIOD
      // ============================================================

      startTime: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      endTime: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      // ============================================================
      // PRICE
      // ============================================================

      totalPrice: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      // ============================================================
      // STATUS
      // ============================================================

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "PENDING",
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
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

    await queryInterface.addIndex("bookings", ["fieldId"], {
      name: "idx_bookings_field_id",
    });

    await queryInterface.addIndex("bookings", ["userId"], {
      name: "idx_bookings_user_id",
    });

    await queryInterface.addIndex("bookings", ["cityId"], {
      name: "idx_bookings_city_id",
    });

    await queryInterface.addIndex(
      "bookings",
      ["fieldId", "startTime", "endTime"],
      {
        name: "idx_bookings_field_schedule",
      },
    );

    await queryInterface.addIndex("bookings", ["status"], {
      name: "idx_bookings_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("bookings");
  },
};