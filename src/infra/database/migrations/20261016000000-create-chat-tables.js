"use strict";

/**
 * Cria as tabelas do módulo de Chat:
 *
 * - chat_conversations: uma conversa por partida (matchId único),
 *   aberta quando as duas equipas aceitam o jogo.
 * - chat_participants: participantes (donos das equipas) e estado
 *   de leitura de cada um.
 * - chat_messages: mensagens de texto, voz e sistema.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ============================================================
    // CONVERSATIONS
    // ============================================================

    await queryInterface.createTable(
      "chat_conversations",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },

        matchId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
        },

        homeTeamId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        awayTeamId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        cityId: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },

        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "OPEN",
        },

        openedAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },

        closesAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },

        matchFinishedAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        closedAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        closeReason: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },

        lastMessageAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },

        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
    );

    await queryInterface.addIndex(
      "chat_conversations",
      ["matchId"],
      {
        unique: true,
        name: "uq_chat_conversations_match_id",
      },
    );

    await queryInterface.addIndex(
      "chat_conversations",
      ["status"],
      {
        name: "idx_chat_conversations_status",
      },
    );

    // ============================================================
    // PARTICIPANTS
    // ============================================================

    await queryInterface.createTable(
      "chat_participants",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },

        conversationId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        teamId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        role: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "OWNER",
        },

        lastReadAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },

        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
    );

    await queryInterface.addIndex(
      "chat_participants",
      ["conversationId", "userId"],
      {
        unique: true,
        name: "uq_chat_participants_conversation_user",
      },
    );

    await queryInterface.addIndex(
      "chat_participants",
      ["userId"],
      {
        name: "idx_chat_participants_user_id",
      },
    );

    // ============================================================
    // MESSAGES
    // ============================================================

    await queryInterface.createTable(
      "chat_messages",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },

        conversationId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        senderId: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },

        senderTeamId: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },

        type: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },

        content: {
          type: Sequelize.TEXT,
          allowNull: true,
        },

        mediaUrl: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },

        mediaDurationSec: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },

        mediaMimeType: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },

        mediaSizeBytes: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },

        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
    );

    await queryInterface.addIndex(
      "chat_messages",
      ["conversationId", "id"],
      {
        name: "idx_chat_messages_conversation_id",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("chat_messages");

    await queryInterface.dropTable("chat_participants");

    await queryInterface.dropTable("chat_conversations");
  },
};
