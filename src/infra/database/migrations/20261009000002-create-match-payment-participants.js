"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("match_payment_participants", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      matchPaymentId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      participantId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      participantType: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "TEAM",
      },

      amountDue: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      amountPaid: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },

      isPaid: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex(
      "match_payment_participants",
      ["matchPaymentId"],
      {
        name: "idx_match_payment_participants_match_payment_id",
      },
    );

    await queryInterface.addConstraint("match_payment_participants", {
      fields: ["matchPaymentId"],
      type: "foreign key",
      name: "fk_match_payment_participants_match_payment_id",
      references: {
        table: "match_payments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "match_payment_participants",
      "fk_match_payment_participants_match_payment_id",
    );

    await queryInterface.dropTable("match_payment_participants");
  },
};
