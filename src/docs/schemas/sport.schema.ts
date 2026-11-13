/**
 * @swagger
 * components:
 *   schemas:
 *     SportModality:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         categoryId: { type: integer, nullable: true, example: 1 }
 *         name: { type: string, example: Futebol }
 *         slug: { type: string, example: futebol }
 *         description: { type: string, nullable: true }
 *         icon: { type: string, nullable: true }
 *         imageUrl: { type: string, format: uri, nullable: true }
 *         isActive: { type: boolean, example: true }
 *         isFeatured: { type: boolean, example: true }
 *         sortOrder: { type: integer, example: 1 }
 *         createdBy: { type: integer, nullable: true }
 *         teamIds: { type: array, items: { type: integer } }
 *         fieldIds: { type: array, items: { type: integer } }
 *         formats: { type: array, items: { $ref: '#/components/schemas/SportModalityFormat' } }
 *     SportModalityFormat:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         modalityId: { type: integer }
 *         name: { type: string, example: Futebol de 7 }
 *         slug: { type: string, example: futebol-de-7 }
 *         playersPerTeam: { type: integer, nullable: true, example: 7 }
 *         minPlayersPerTeam: { type: integer, nullable: true, example: 5 }
 *         maxPlayersPerTeam: { type: integer, nullable: true, example: 7 }
 *         isActive: { type: boolean }
 *     SportCategory:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         name: { type: string, example: Desportos de equipa }
 *         slug: { type: string, example: desportos-de-equipa }
 *         description: { type: string, nullable: true }
 *         isActive: { type: boolean }
 *         sortOrder: { type: integer }
 */
