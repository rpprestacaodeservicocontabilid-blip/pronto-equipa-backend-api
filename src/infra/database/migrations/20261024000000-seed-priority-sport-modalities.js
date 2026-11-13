"use strict";

const categories = [
  { name: "Desportos de equipa", slug: "desportos-de-equipa", sortOrder: 1 },
  { name: "Desportos de raquete", slug: "desportos-de-raquete", sortOrder: 2 },
];

const modalities = [
  { name: "Futebol", slug: "futebol", categorySlug: "desportos-de-equipa", isFeatured: true },
  { name: "Futsal", slug: "futsal", categorySlug: "desportos-de-equipa", isFeatured: true },
  { name: "Basquetebol", slug: "basquetebol", categorySlug: "desportos-de-equipa", isFeatured: true },
  { name: "Voleibol", slug: "voleibol", categorySlug: "desportos-de-equipa", isFeatured: true },
  { name: "Andebol", slug: "andebol", categorySlug: "desportos-de-equipa", isFeatured: true },
  { name: "Ténis", slug: "tenis", categorySlug: "desportos-de-raquete", isFeatured: true },
  { name: "Pádel", slug: "padel", categorySlug: "desportos-de-raquete", isFeatured: false },
  { name: "Badminton", slug: "badminton", categorySlug: "desportos-de-raquete", isFeatured: false },
];

const formats = {
  futebol: [
    ["Futebol de 11", "11", 11, 7, 11],
    ["Futebol de 7", "7", 7, 5, 7],
    ["Futebol de 5", "5", 5, 3, 5],
  ],
  futsal: [["Futsal", "futsal", 5, 3, 5]],
  basquetebol: [["Basquetebol", "basquetebol", 5, 3, 5]],
  voleibol: [["Indoor", "indoor", 6, 4, 6]],
  andebol: [["Andebol", "andebol", 7, 5, 7]],
  tenis: [["Singulares", "singulares", 1, 1, 1], ["Pares", "pares", 2, 2, 2]],
  padel: [["Pares", "pares", 2, 2, 2]],
  badminton: [["Singulares", "singulares", 1, 1, 1], ["Pares", "pares", 2, 2, 2]],
};

async function select(queryInterface, Sequelize, sql, replacements) {
  return queryInterface.sequelize.query(sql, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const categoryIds = {};

    for (const category of categories) {
      let [row] = await select(queryInterface, Sequelize,
        "SELECT id FROM sport_categories WHERE slug = :slug", { slug: category.slug });
      if (!row) {
        await queryInterface.bulkInsert("sport_categories", [{
          ...category, description: null, isActive: true, createdAt: now, updatedAt: now,
        }]);
        [row] = await select(queryInterface, Sequelize,
          "SELECT id FROM sport_categories WHERE slug = :slug", { slug: category.slug });
      } else {
        await queryInterface.bulkUpdate("sport_categories", {
          name: category.name, isActive: true, sortOrder: category.sortOrder, updatedAt: now,
        }, { slug: category.slug });
      }
      categoryIds[category.slug] = row.id;
    }

    const modalityIds = {};
    for (const [index, modality] of modalities.entries()) {
      const values = {
        categoryId: categoryIds[modality.categorySlug],
        name: modality.name,
        description: null,
        isActive: true,
        isFeatured: modality.isFeatured,
        sortOrder: index + 1,
        updatedAt: now,
      };
      let [row] = await select(queryInterface, Sequelize,
        "SELECT id FROM sport_modalities WHERE slug = :slug", { slug: modality.slug });
      if (!row) {
        await queryInterface.bulkInsert("sport_modalities", [{
          ...values, slug: modality.slug, icon: null, imageUrl: null,
          createdBy: null, createdAt: now,
        }]);
        [row] = await select(queryInterface, Sequelize,
          "SELECT id FROM sport_modalities WHERE slug = :slug", { slug: modality.slug });
      } else {
        await queryInterface.bulkUpdate("sport_modalities", values, { slug: modality.slug });
      }
      modalityIds[modality.slug] = row.id;
    }

    const prioritySlugs = modalities.map(({ slug }) => slug);
    await queryInterface.bulkUpdate("sport_modalities", { isActive: false, isFeatured: false, updatedAt: now }, {
      slug: { [Sequelize.Op.notIn]: prioritySlugs },
    });
    await queryInterface.bulkUpdate("sport_categories", { isActive: false, updatedAt: now }, {
      slug: "desportos-de-praia",
    });

    for (const [modalitySlug, modalityFormats] of Object.entries(formats)) {
      const modalityId = modalityIds[modalitySlug];
      for (const [name, slug, playersPerTeam, minPlayersPerTeam, maxPlayersPerTeam] of modalityFormats) {
        const values = {
          name, playersPerTeam, minPlayersPerTeam, maxPlayersPerTeam,
          isActive: true, updatedAt: now,
        };
        const [row] = await select(queryInterface, Sequelize,
          "SELECT id FROM sport_modality_formats WHERE modalityId = :modalityId AND slug = :slug",
          { modalityId, slug });
        if (row) {
          await queryInterface.bulkUpdate("sport_modality_formats", values, { id: row.id });
        } else {
          await queryInterface.bulkInsert("sport_modality_formats", [{
            ...values, modalityId, slug, createdAt: now,
          }]);
        }
      }
    }

    const activeModalityIds = Object.values(modalityIds);
    await queryInterface.bulkUpdate("sport_modality_formats", { isActive: false, updatedAt: now }, {
      modalityId: { [Sequelize.Op.notIn]: activeModalityIds },
    });
  },

  async down() {
    // O catálogo-base fica preservado para não quebrar equipas, campos e torneios associados.
  },
};
