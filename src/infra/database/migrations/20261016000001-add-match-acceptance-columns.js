"use strict";

/**
 * Adiciona o controlo de aceitação das equipas às partidas.
 *
 * O chat de uma partida só abre quando o dono de cada equipa
 * (casa e fora) aceitar o jogo — ambos os campos preenchidos.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "matches",
      "homeAcceptedAt",
      {
        type: Sequelize.DATE,
        allowNull: true,
      },
    );

    await queryInterface.addColumn(
      "matches",
      "awayAcceptedAt",
      {
        type: Sequelize.DATE,
        allowNull: true,
      },
    );

    await queryInterface.addColumn(
      "matches",
      "confirmedAt",
      {
        type: Sequelize.DATE,
        allowNull: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "matches",
      "homeAcceptedAt",
    );

    await queryInterface.removeColumn(
      "matches",
      "awayAcceptedAt",
    );

    await queryInterface.removeColumn(
      "matches",
      "confirmedAt",
    );
  },
};
