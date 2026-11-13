/**
 * @swagger
 * components:
 *   schemas:
 *     SupportCase:
 *       type: object
 *       required: [id, type, status, priority, subject, description, createdBy, createdAt]
 *       properties:
 *         id: { type: integer, example: 42 }
 *         type: { type: string, enum: [SUPPORT, REPORT, DISPUTE, OPERATIONAL_INCIDENT] }
 *         status: { type: string, enum: [OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED] }
 *         priority: { type: string, enum: [LOW, NORMAL, HIGH, URGENT] }
 *         subject: { type: string }
 *         description: { type: string }
 *         classification: { type: string, nullable: true }
 *         targetType: { type: string, nullable: true }
 *         targetId: { type: string, nullable: true }
 *         evidenceUrl: { type: string, nullable: true }
 *         createdBy: { type: integer }
 *         assignedUserId: { type: integer, nullable: true }
 *         dueAt: { type: string, format: date-time, nullable: true }
 *         resolutionNote: { type: string, nullable: true }
 *         resolvedBy: { type: integer, nullable: true }
 *         resolvedAt: { type: string, format: date-time, nullable: true }
 *         closedBy: { type: integer, nullable: true }
 *         closedAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *     SupportCaseActivity:
 *       type: object
 *       required: [id, caseId, actorUserId, action, createdAt]
 *       properties:
 *         id: { type: integer }
 *         caseId: { type: integer }
 *         actorUserId: { type: integer }
 *         action: { type: string }
 *         field: { type: string, nullable: true }
 *         previousValue: { type: string, nullable: true }
 *         newValue: { type: string, nullable: true }
 *         message: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *   paths:
 *     /support-cases:
 *       get:
 *         tags: [Support Cases]
 *         summary: Lista casos (apenas administradores)
 *         security: [{ bearerAuth: [] }]
 *         parameters:
 *           - in: query
 *             name: type
 *             schema: { type: string, enum: [SUPPORT, REPORT, DISPUTE, OPERATIONAL_INCIDENT] }
 *           - in: query
 *             name: status
 *             schema: { type: string, enum: [OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED] }
 *           - in: query
 *             name: history
 *             schema: { type: boolean }
 *         responses:
 *           200:
 *             description: Casos encontrados.
 *             content:
 *               application/json:
 *                 schema:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/SupportCase' }
 *       post:
 *         tags: [Support Cases]
 *         summary: Cria um pedido ou denúncia para o utilizador autenticado
 *         security: [{ bearerAuth: [] }]
 *         requestBody:
 *           required: true
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 required: [type, subject, description]
 *                 properties:
 *                   type: { type: string, enum: [SUPPORT, REPORT, DISPUTE, OPERATIONAL_INCIDENT] }
 *                   priority: { type: string, enum: [LOW, NORMAL, HIGH, URGENT] }
 *                   subject: { type: string, maxLength: 180 }
 *                   description: { type: string }
 *                   classification: { type: string }
 *                   targetType: { type: string }
 *                   targetId: { type: string }
 *                   evidenceUrl: { type: string, format: uri }
 *                   dueAt: { type: string, format: date-time }
 *         responses:
 *           201:
 *             description: Caso criado com entrada inicial no histórico.
 *             content:
 *               application/json:
 *                 schema: { $ref: '#/components/schemas/SupportCase' }
 *     /support-cases/mine:
 *       get:
 *         tags: [Support Cases]
 *         summary: Lista casos criados pelo utilizador autenticado
 *         security: [{ bearerAuth: [] }]
 *         responses:
 *           200:
 *             description: Casos do utilizador autenticado.
 *     /support-cases/assignees:
 *       get:
 *         tags: [Support Cases]
 *         summary: Lista utilizadores disponíveis para atribuição (apenas equipa de suporte)
 *         security: [{ bearerAuth: [] }]
 *         responses:
 *           200:
 *             description: Membros ativos da equipa de suporte.
 *     /support-cases/{id}:
 *       get:
 *         tags: [Support Cases]
 *         summary: Consulta um caso e o seu histórico (apenas administradores)
 *         security: [{ bearerAuth: [] }]
 *         parameters:
 *           - in: path
 *             name: id
 *             required: true
 *             schema: { type: integer }
 *         responses:
 *           200:
 *             description: Caso e intervenções.
 *       patch:
 *         tags: [Support Cases]
 *         summary: Atualiza estado, prioridade, responsável, classificação ou prazo
 *         security: [{ bearerAuth: [] }]
 *         parameters:
 *           - in: path
 *             name: id
 *             required: true
 *             schema: { type: integer }
 *         requestBody:
 *           required: true
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status: { type: string, enum: [OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED] }
 *                   priority: { type: string, enum: [LOW, NORMAL, HIGH, URGENT] }
 *                   assignedUserId: { type: integer, nullable: true }
 *                   classification: { type: string, nullable: true }
 *                   dueAt: { type: string, format: date-time, nullable: true }
 *                   resolutionNote: { type: string }
 *         responses:
 *           200:
 *             description: Caso atualizado e intervenção registada.
 *     /support-cases/{id}/responses:
 *       post:
 *         tags: [Support Cases]
 *         summary: Regista uma resposta no histórico
 *         security: [{ bearerAuth: [] }]
 *         parameters:
 *           - in: path
 *             name: id
 *             required: true
 *             schema: { type: integer }
 *         requestBody:
 *           required: true
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 required: [message]
 *                 properties:
 *                   message: { type: string, maxLength: 10000 }
 *         responses:
 *           201:
 *             description: Resposta registada no histórico.
 */
export {};
