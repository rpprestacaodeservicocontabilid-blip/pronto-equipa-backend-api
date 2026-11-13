"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // payment_refunds.paymentId -> payments.id
    await queryInterface.addConstraint("payment_refunds", {
      fields: ["paymentId"],
      type: "foreign key",
      name: "fk_payment_refunds_payment_id",
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
      "payment_refunds",
      "fk_payment_refunds_payment_id"
    );
  },
};