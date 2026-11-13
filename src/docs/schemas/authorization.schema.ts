/**
 * @swagger
 * components:
 *   schemas:
 *
 *     AssignRoleRequest:
 *       type: object
 *       required:
 *         - userId
 *         - roleId
 *       properties:
 *         userId:
 *           type: integer
 *           minimum: 1
 *           description: ID do utilizador que receberá a role.
 *           example: 15
 *
 *         roleId:
 *           type: integer
 *           minimum: 1
 *           description: ID da role que será atribuída.
 *           example: 2
 *
 *
 *     RemoveRoleRequest:
 *       type: object
 *       required:
 *         - userId
 *         - roleId
 *       properties:
 *         userId:
 *           type: integer
 *           minimum: 1
 *           description: ID do utilizador do qual a role será removida.
 *           example: 15
 *
 *         roleId:
 *           type: integer
 *           minimum: 1
 *           description: ID da role que será removida.
 *           example: 2
 *
 *
 *     AssignPermissionRequest:
 *       type: object
 *       required:
 *         - roleId
 *         - permissionId
 *       properties:
 *         roleId:
 *           type: integer
 *           minimum: 1
 *           description: ID da role relacionada com a operação.
 *           example: 2
 *
 *         permissionId:
 *           type: integer
 *           minimum: 1
 *           description: ID da permissão que será atribuída.
 *           example: 5
 *
 *
 *     RemovePermissionRequest:
 *       type: object
 *       required:
 *         - roleId
 *         - permissionId
 *       properties:
 *         roleId:
 *           type: integer
 *           minimum: 1
 *           description: ID da role relacionada com a operação.
 *           example: 2
 *
 *         permissionId:
 *           type: integer
 *           minimum: 1
 *           description: ID da permissão que será removida.
 *           example: 5
 *
 *
 *     PermissionCheckResponse:
 *       type: object
 *       required:
 *         - allowed
 *       properties:
 *         allowed:
 *           type: boolean
 *           description: Indica se o utilizador possui a permissão solicitada.
 *           example: true
 *
 *
 *     AuthorizationResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indica se a operação foi executada com sucesso.
 *           example: true
 *
 *         message:
 *           type: string
 *           description: Mensagem relacionada com a operação.
 *           example: Operation completed successfully.
 */