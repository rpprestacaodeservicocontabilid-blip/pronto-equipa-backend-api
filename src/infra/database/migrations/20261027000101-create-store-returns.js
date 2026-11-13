"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_return_policies", {
      id: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      windowDays: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 15 },
      allowChangeOfMind: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });

    await queryInterface.bulkInsert("store_return_policies", [{
      id: 1,
      enabled: false,
      windowDays: 15,
      allowChangeOfMind: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    await queryInterface.createTable("store_return_requests", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      orderId: { type: Sequelize.INTEGER, allowNull: false },
      customerId: { type: Sequelize.INTEGER, allowNull: false },
      reason: { type: Sequelize.STRING(32), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: "REQUESTED" },
      reviewedBy: { type: Sequelize.INTEGER, allowNull: true },
      reviewedAt: { type: Sequelize.DATE, allowNull: true },
      reviewNote: { type: Sequelize.TEXT, allowNull: true },
      carrier: { type: Sequelize.STRING(80), allowNull: true },
      trackingCode: { type: Sequelize.STRING(120), allowNull: true },
      receivedBy: { type: Sequelize.INTEGER, allowNull: true },
      receivedAt: { type: Sequelize.DATE, allowNull: true },
      inspectedBy: { type: Sequelize.INTEGER, allowNull: true },
      inspectedAt: { type: Sequelize.DATE, allowNull: true },
      refundAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      refundMethod: { type: Sequelize.STRING(60), allowNull: true },
      refundReference: { type: Sequelize.STRING(120), allowNull: true },
      refundNote: { type: Sequelize.TEXT, allowNull: true },
      refundedBy: { type: Sequelize.INTEGER, allowNull: true },
      refundedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("store_return_requests", ["orderId"]);
    await queryInterface.addIndex("store_return_requests", ["customerId"]);
    await queryInterface.addIndex("store_return_requests", ["status"]);

    await queryInterface.createTable("store_return_items", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      returnRequestId: { type: Sequelize.INTEGER, allowNull: false },
      orderItemId: { type: Sequelize.INTEGER, allowNull: false },
      quantityRequested: { type: Sequelize.INTEGER, allowNull: false },
      quantityReceived: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      quantityAccepted: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      quantityRestocked: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      inspectionNote: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("store_return_items", ["returnRequestId"]);
    await queryInterface.addIndex("store_return_items", ["orderItemId"]);

    await queryInterface.createTable("store_return_events", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      returnRequestId: { type: Sequelize.INTEGER, allowNull: true },
      actorId: { type: Sequelize.INTEGER, allowNull: true },
      action: { type: Sequelize.STRING(32), allowNull: false },
      fromStatus: { type: Sequelize.STRING(24), allowNull: true },
      toStatus: { type: Sequelize.STRING(24), allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("store_return_events", ["returnRequestId", "createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_return_events");
    await queryInterface.dropTable("store_return_items");
    await queryInterface.dropTable("store_return_requests");
    await queryInterface.dropTable("store_return_policies");
  },
};
