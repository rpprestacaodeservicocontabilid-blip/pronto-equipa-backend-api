"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("sport_categories", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      slug: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable("sport_modalities", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      categoryId: { type: Sequelize.INTEGER, allowNull: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      slug: { type: Sequelize.STRING(140), allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      icon: { type: Sequelize.STRING(120), allowNull: true },
      imageUrl: { type: Sequelize.STRING(500), allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      isFeatured: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdBy: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable("sport_modality_formats", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      modalityId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      slug: { type: Sequelize.STRING(140), allowNull: false },
      playersPerTeam: { type: Sequelize.INTEGER, allowNull: true },
      minPlayersPerTeam: { type: Sequelize.INTEGER, allowNull: true },
      maxPlayersPerTeam: { type: Sequelize.INTEGER, allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable("team_modalities", {
      teamId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
      modalityId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.createTable("field_modalities", {
      fieldId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
      modalityId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addConstraint("sport_modalities", {
      fields: ["categoryId"], type: "foreign key", name: "fk_sport_modalities_category",
      references: { table: "sport_categories", field: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL",
    });
    await queryInterface.addConstraint("sport_modalities", {
      fields: ["createdBy"], type: "foreign key", name: "fk_sport_modalities_creator",
      references: { table: "users", field: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL",
    });
    await queryInterface.addConstraint("sport_modality_formats", {
      fields: ["modalityId"], type: "foreign key", name: "fk_sport_modality_formats_modality",
      references: { table: "sport_modalities", field: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE",
    });
    await queryInterface.addConstraint("team_modalities", {
      fields: ["teamId"], type: "foreign key", name: "fk_team_modalities_team",
      references: { table: "teams", field: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE",
    });
    await queryInterface.addConstraint("team_modalities", {
      fields: ["modalityId"], type: "foreign key", name: "fk_team_modalities_modality",
      references: { table: "sport_modalities", field: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE",
    });
    await queryInterface.addConstraint("field_modalities", {
      fields: ["fieldId"], type: "foreign key", name: "fk_field_modalities_field",
      references: { table: "fields", field: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE",
    });
    await queryInterface.addConstraint("field_modalities", {
      fields: ["modalityId"], type: "foreign key", name: "fk_field_modalities_modality",
      references: { table: "sport_modalities", field: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE",
    });

    await queryInterface.addColumn("tournaments", "modalityId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "sport_modalities", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("sport_modalities", ["categoryId", "isActive"], { name: "idx_sport_modalities_category_active" });
    await queryInterface.addIndex("sport_modalities", ["isFeatured", "sortOrder"], { name: "idx_sport_modalities_featured_order" });
    await queryInterface.addIndex("sport_modality_formats", ["modalityId", "slug"], { name: "uq_sport_modality_formats_slug", unique: true });
    await queryInterface.addIndex("team_modalities", ["modalityId", "teamId"], { name: "idx_team_modalities_modality" });
    await queryInterface.addIndex("field_modalities", ["modalityId", "fieldId"], { name: "idx_field_modalities_modality" });
    await queryInterface.addIndex("tournaments", ["modalityId"], { name: "idx_tournaments_modality_id" });

  },

  async down(queryInterface) {
    await queryInterface.removeIndex("tournaments", "idx_tournaments_modality_id");
    await queryInterface.removeColumn("tournaments", "modalityId");
    await queryInterface.dropTable("field_modalities");
    await queryInterface.dropTable("team_modalities");
    await queryInterface.dropTable("sport_modality_formats");
    await queryInterface.dropTable("sport_modalities");
    await queryInterface.dropTable("sport_categories");
  },
};
