/**
 * @swagger
 * components:
 *   schemas:
 *     CreateUser:
 *       type: object
 *       required: [name, email]
 *       properties:
 *         name:
 *           type: string
 *           example: 'João Silva'
 *         email:
 *           type: string
 *           format: email
 *           example: 'joao.silva@email.com'
 *         phone:
 *           type: string
 *           nullable: true
 *           example: '+5511999999999'
 *         type:
 *           type: string
 *           enum: [PLAYER, TEAM_MANAGER, ORGANIZER, REFEREE, FIELD_OWNER, ADMIN, MODERATOR, STAFF, SUPPORT, REGULAR]
 *           example: PLAYER
 *         profileType:
 *           type: string
 *           enum: [PERSONAL, PROFESSIONAL, PLAYER, ORGANIZER, BUSINESS]
 *           example: PLAYER
 *         avatar:
 *           type: string
 *           nullable: true
 *           example: 'https://example.com/avatar.png'
 *     UpdateUser:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: 'João Silva'
 *         email:
 *           type: string
 *           format: email
 *           example: 'joao.silva@email.com'
 *         phone:
 *           type: string
 *           nullable: true
 *           example: '+5511999999999'
 *         type:
 *           type: string
 *           enum: [PLAYER, TEAM_MANAGER, ORGANIZER, REFEREE, FIELD_OWNER, ADMIN, MODERATOR, STAFF, SUPPORT, REGULAR]
 *           example: PLAYER
 *         avatar:
 *           type: string
 *           nullable: true
 *           example: 'https://example.com/avatar.png'
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'João Silva'
 *         email:
 *           type: string
 *           format: email
 *           example: 'joao.silva@email.com'
 *         phone:
 *           type: string
 *           nullable: true
 *           example: '+5511999999999'
 *         type:
 *           type: string
 *           enum: [PLAYER, TEAM_MANAGER, ORGANIZER, REFEREE, FIELD_OWNER, ADMIN, MODERATOR, STAFF, SUPPORT, REGULAR]
 *           example: PLAYER
 *         status:
 *           type: string
 *           enum: [PENDING, ACTIVE, INACTIVE, SUSPENDED, BLOCKED, DELETED]
 *           example: ACTIVE
 *         profileId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         emailVerifiedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastLoginAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         userId:
 *           type: integer
 *           example: 1
 *         type:
 *           type: string
 *           enum: [PERSONAL, PROFESSIONAL, PLAYER, ORGANIZER, BUSINESS]
 *           example: PLAYER
 *         firstName:
 *           type: string
 *           example: 'João'
 *         lastName:
 *           type: string
 *           nullable: true
 *           example: 'Silva'
 *         displayName:
 *           type: string
 *           nullable: true
 *           example: 'João Silva'
 *         phone:
 *           type: string
 *           nullable: true
 *           example: '+5511999999999'
 *         avatar:
 *           type: string
 *           nullable: true
 *           example: 'https://example.com/avatar.png'
 *         bio:
 *           type: string
 *           nullable: true
 *           example: 'Jogador de futebol amador'
 *         cityId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         provinceId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         countryId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           nullable: true
 *           example: '1990-05-15'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     UpdateProfile:
 *       type: object
 *       properties:
 *         bio:
 *           type: string
 *           nullable: true
 *           example: 'Jogador de futebol amador'
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           nullable: true
 *           example: '1990-05-15'
 *         gender:
 *           type: string
 *           nullable: true
 *           example: 'MALE'
 *         address:
 *           type: string
 *           nullable: true
 *           example: 'Rua das Flores, 123'
 *         cityId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         provinceId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         countryId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         avatar:
 *           type: string
 *           nullable: true
 *           example: 'https://example.com/avatar.png'
 *     AssignRole:
 *       type: object
 *       required: [roleId]
 *       properties:
 *         roleId:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *     RemoveRole:
 *       type: object
 *       required: [roleId]
 *       properties:
 *         roleId:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *     AssignPermission:
 *       type: object
 *       required: [permissionId]
 *       properties:
 *         permissionId:
 *           type: integer
 *           minimum: 1
 *           example: 5
 *     RemovePermission:
 *       type: object
 *       required: [permissionId]
 *       properties:
 *         permissionId:
 *           type: integer
 *           minimum: 1
 *           example: 5
 *     Role:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'PLAYER'
 *         description:
 *           type: string
 *           example: 'Jogador padrão'
 *         system:
 *           type: boolean
 *           example: true
 *         active:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     Permission:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'matches:read'
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Permite ler partidas'
 *         resource:
 *           type: string
 *           example: 'matches'
 *         action:
 *           type: string
 *           example: 'read'
 *         scope:
 *           type: string
 *           enum: [GLOBAL, PLATFORM, CITY, PROVINCE, TOURNAMENT, TEAM, FIELD, MATCH, OWN]
 *           example: GLOBAL
 *         active:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
