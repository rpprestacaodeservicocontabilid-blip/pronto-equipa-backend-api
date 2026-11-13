/**
 * @swagger
 * components:
 *   schemas:
 *     CreateTeam:
 *       type: object
 *       required: [name, cityId, ownerId]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 3
 *           maxLength: 100
 *           example: 'Peladeiros FC'
 *         logo:
 *           type: string
 *           nullable: true
 *           example: 'https://example.com/logo.png'
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Time de futebol amador'
 *         cityId:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *         ownerId:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *     UpdateTeam:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 3
 *           maxLength: 100
 *           example: 'Peladeiros FC Atualizado'
 *         logo:
 *           type: string
 *           nullable: true
 *           example: 'https://example.com/logo.png'
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Descrição atualizada'
 *     Team:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'Peladeiros FC'
 *         logo:
 *           type: string
 *           nullable: true
 *           example: 'https://example.com/logo.png'
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Time de futebol amador'
 *         cityId:
 *           type: integer
 *           example: 1
 *         ownerId:
 *           type: integer
 *           example: 1
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
