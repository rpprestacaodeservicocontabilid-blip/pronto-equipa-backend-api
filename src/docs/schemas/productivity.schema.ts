/**
 * @swagger
 * components:
 *   schemas:
 *     CreateDepartment:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 80
 *           example: 'Operações'
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *           example: 'Rotina interna da empresa'
 *     UpdateDepartment:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 80
 *           example: 'Operações e Logística'
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *           example: 'Descrição atualizada'
 *     Member:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 2
 *         name:
 *           type: string
 *           example: 'João Jamba'
 *         email:
 *           type: string
 *           example: 'joao@email.com'
 *         type:
 *           type: string
 *           example: 'PLAYER'
 *         status:
 *           type: string
 *           example: 'ACTIVE'
 *     Department:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'Operações'
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Rotina interna da empresa'
 *         members:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Member'
 *         memberCount:
 *           type: integer
 *           example: 3
 *         taskCount:
 *           type: integer
 *           example: 6
 *         doneTaskCount:
 *           type: integer
 *           example: 2
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateTask:
 *       type: object
 *       required: [title, departmentId, assigneeId]
 *       properties:
 *         title:
 *           type: string
 *           minLength: 2
 *           maxLength: 150
 *           example: 'Atualizar tabela de preços'
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 2000
 *           example: 'Rever valores por hora na zona sul.'
 *         status:
 *           type: string
 *           enum: [TODO, IN_PROGRESS, IN_REVIEW, DONE]
 *           default: TODO
 *         priority:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, URGENT]
 *           default: MEDIUM
 *         dueDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           example: '2026-10-20'
 *         departmentId:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *         assigneeId:
 *           type: integer
 *           minimum: 1
 *           description: Tem de ser membro do departamento.
 *           example: 2
 *     UpdateTask:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           minLength: 2
 *           maxLength: 150
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 2000
 *         status:
 *           type: string
 *           enum: [TODO, IN_PROGRESS, IN_REVIEW, DONE]
 *         priority:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, URGENT]
 *         dueDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         departmentId:
 *           type: integer
 *           minimum: 1
 *         assigneeId:
 *           type: integer
 *           minimum: 1
 *           nullable: true
 *           description: 'null desatribui a tarefa; senão tem de ser membro do departamento.'
 *     Task:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         title:
 *           type: string
 *           example: 'Atualizar tabela de preços'
 *         description:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [TODO, IN_PROGRESS, IN_REVIEW, DONE]
 *           example: 'IN_PROGRESS'
 *         priority:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, URGENT]
 *           example: 'HIGH'
 *         dueDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         departmentId:
 *           type: integer
 *           example: 1
 *         departmentName:
 *           type: string
 *           nullable: true
 *           example: 'Operações'
 *         assigneeId:
 *           type: integer
 *           nullable: true
 *           example: 2
 *         assigneeName:
 *           type: string
 *           nullable: true
 *           example: 'João Jamba'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
export {};
