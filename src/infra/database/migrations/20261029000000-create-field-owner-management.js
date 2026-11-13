'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('field_owner_details', {
        fieldId: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: 'fields', key: 'id' }, onDelete: 'RESTRICT' },
        ownerUserId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
        description: { type: Sequelize.TEXT, allowNull: false }, latitude: { type: Sequelize.DOUBLE, allowNull: true }, longitude: { type: Sequelize.DOUBLE, allowNull: true },
        photoUrls: { type: Sequelize.JSON, allowNull: false }, facilities: { type: Sequelize.JSON, allowNull: false },
        publicationStatus: { type: Sequelize.STRING(32), allowNull: false }, reviewNote: { type: Sequelize.TEXT, allowNull: true }, revision: { type: Sequelize.INTEGER, allowNull: false },
      }, { transaction });
      await queryInterface.addIndex('field_owner_details', ['ownerUserId', 'publicationStatus'], { transaction });
      await queryInterface.createTable('field_owner_activities', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        fieldId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fields', key: 'id' }, onDelete: 'RESTRICT' },
        actorUserId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' },
        action: { type: Sequelize.STRING(40), allowNull: false }, note: { type: Sequelize.TEXT, allowNull: true },
        before: { type: Sequelize.JSON, allowNull: true }, after: { type: Sequelize.JSON, allowNull: false }, createdAt: { type: Sequelize.DATE, allowNull: false },
      }, { transaction });
      await queryInterface.addIndex('field_owner_activities', ['fieldId', 'id'], { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('field_owner_activities', { transaction });
      await queryInterface.dropTable('field_owner_details', { transaction });
    });
  },
};
