"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // payment_transactions.paymentId -> payments.id
    await queryInterface.addConstraint("payment_transactions", {
      fields: ["paymentId"],
      type: "foreign key",
      name: "fk_payment_transactions_payment_id",
      references: {
        table: "payments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "payment_transactions",
      "fk_payment_transactions_payment_id"
    );
  },
};