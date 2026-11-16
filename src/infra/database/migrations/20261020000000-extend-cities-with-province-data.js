'use strict';

const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('cities');
    if (!columns.publicId)
      await queryInterface.addColumn('cities', 'publicId', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    if (!columns.founded)
      await queryInterface.addColumn('cities', 'founded', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      });
    if (!columns.capital)
      await queryInterface.addColumn('cities', 'capital', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      });
    if (!columns.area)
      await queryInterface.addColumn('cities', 'area', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      });
    if (!columns.telephonePrefix)
      await queryInterface.addColumn('cities', 'telephonePrefix', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      });
    if (!columns.governmentWebsite)
      await queryInterface.addColumn('cities', 'governmentWebsite', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      });
    if (!columns.municipalities)
      await queryInterface.addColumn('cities', 'municipalities', {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '[]',
      });

    const rows = await queryInterface.sequelize.query('SELECT id, publicId FROM cities', {
      type: Sequelize.QueryTypes.SELECT,
    });
    for (const row of rows) {
      if (!row.publicId)
        await queryInterface.bulkUpdate('cities', { publicId: randomUUID() }, { id: row.id });
    }
    // Keep the column nullable at the SQL layer: SQLite rebuilds this table for
    // changeColumn, which can break existing foreign keys to its integer ID.
    // Sequelize's CityModel requires publicId for all application writes.
    await queryInterface.addIndex('cities', ['publicId'], {
      unique: true,
      name: 'idx_cities_public_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('cities', 'idx_cities_public_id_unique');
    for (const column of [
      'municipalities',
      'governmentWebsite',
      'telephonePrefix',
      'area',
      'capital',
      'founded',
      'publicId',
    ]) {
      await queryInterface.removeColumn('cities', column);
    }
  },
};
