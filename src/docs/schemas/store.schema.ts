/**
 * @swagger
 * components:
 *   schemas:
 *     CreateStoreCatalogEntry:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 80
 *           example: 'Chuteiras'
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *           example: 'Calçado para relvado, sintético e futsal'
 *     UpdateStoreCatalogEntry:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 80
 *           example: 'Chuteiras'
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *     StoreCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'Chuteiras'
 *         description:
 *           type: string
 *           nullable: true
 *         productCount:
 *           type: integer
 *           example: 3
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     StoreBrand:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'Nike'
 *         description:
 *           type: string
 *           nullable: true
 *         productCount:
 *           type: integer
 *           example: 2
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateStoreProduct:
 *       type: object
 *       required: [name, price]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 150
 *           example: 'Chuteira Nike Mercurial Vapor XII Pro FG'
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 2000
 *         price:
 *           type: number
 *           format: double
 *           minimum: 0
 *           exclusiveMinimum: true
 *           example: 45000
 *         imageUrl:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *         status:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ARCHIVED]
 *           default: ACTIVE
 *         categoryId:
 *           type: integer
 *           nullable: true
 *         brandId:
 *           type: integer
 *           nullable: true
 *     UpdateStoreProduct:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 150
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 2000
 *         price:
 *           type: number
 *           format: double
 *         imageUrl:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ARCHIVED]
 *         categoryId:
 *           type: integer
 *           nullable: true
 *         brandId:
 *           type: integer
 *           nullable: true
 *     StoreVariant:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 4
 *         productId:
 *           type: integer
 *           example: 1
 *         size:
 *           type: string
 *           nullable: true
 *           example: '40'
 *         color:
 *           type: string
 *           nullable: true
 *           example: 'Preto'
 *         sku:
 *           type: string
 *           example: 'AH7382-107-40'
 *         price:
 *           type: number
 *           nullable: true
 *           format: double
 *           description: 'null → usa o preço base do produto'
 *           example: 52000
 *         isActive:
 *           type: boolean
 *           example: true
 *         quantity:
 *           type: integer
 *           example: 12
 *         reserved:
 *           type: integer
 *           example: 2
 *         available:
 *           type: integer
 *           example: 10
 *         minStock:
 *           type: integer
 *           example: 5
 *     CreateStoreVariant:
 *       type: object
 *       required: [sku]
 *       properties:
 *         size:
 *           type: string
 *           nullable: true
 *           maxLength: 20
 *           example: '40'
 *         color:
 *           type: string
 *           nullable: true
 *           maxLength: 40
 *           example: 'Preto'
 *         sku:
 *           type: string
 *           minLength: 2
 *           maxLength: 60
 *           example: 'AH7382-107-40'
 *         price:
 *           type: number
 *           nullable: true
 *           format: double
 *         isActive:
 *           type: boolean
 *           default: true
 *     UpdateStoreVariant:
 *       type: object
 *       properties:
 *         size:
 *           type: string
 *           nullable: true
 *           maxLength: 20
 *         color:
 *           type: string
 *           nullable: true
 *           maxLength: 40
 *         sku:
 *           type: string
 *           minLength: 2
 *           maxLength: 60
 *         price:
 *           type: number
 *           nullable: true
 *           format: double
 *         isActive:
 *           type: boolean
 *     StoreProduct:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'Chuteira Nike Mercurial Vapor XII Pro FG'
 *         description:
 *           type: string
 *           nullable: true
 *         price:
 *           type: number
 *           format: double
 *           example: 45000
 *         imageUrl:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ARCHIVED]
 *           example: 'ACTIVE'
 *         categoryId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         categoryName:
 *           type: string
 *           nullable: true
 *           example: 'Chuteiras'
 *         brandId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         brandName:
 *           type: string
 *           nullable: true
 *           example: 'Nike'
 *         variants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StoreVariant'
 *         variantCount:
 *           type: integer
 *           example: 3
 *         stockUnits:
 *           type: integer
 *           example: 24
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     StoreInventoryRow:
 *       type: object
 *       properties:
 *         variantId:
 *           type: integer
 *           example: 4
 *         productId:
 *           type: integer
 *           example: 1
 *         productName:
 *           type: string
 *           example: 'Chuteira Nike Mercurial Vapor XII Pro FG'
 *         imageUrl:
 *           type: string
 *           nullable: true
 *         size:
 *           type: string
 *           nullable: true
 *           example: '40'
 *         color:
 *           type: string
 *           nullable: true
 *           example: 'Preto'
 *         sku:
 *           type: string
 *           example: 'AH7382-107-40'
 *         price:
 *           type: number
 *           format: double
 *           example: 52000
 *         quantity:
 *           type: integer
 *           example: 12
 *         reserved:
 *           type: integer
 *           example: 2
 *         available:
 *           type: integer
 *           example: 10
 *         minStock:
 *           type: integer
 *           example: 5
 *         lowStock:
 *           type: boolean
 *           example: false
 *         outOfStock:
 *           type: boolean
 *           example: false
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     AdjustStoreStock:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [IN, OUT, ADJUST, RETURN, LOSS]
 *           description: Movimento a registar (junto com quantity); todos exigem reason.
 *         quantity:
 *           type: integer
 *           minimum: 0
 *           description: >-
 *             IN/OUT/RETURN/LOSS → unidades a adicionar/remover (pelo
 *             menos 1); ADJUST → novo total físico resultante (pode ser 0).
 *         reason:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           example: 'Reposição de armazém'
 *         minStock:
 *           type: integer
 *           minimum: 0
 *           description: Limiar de alerta de stock baixo.
 *     StoreStockMovement:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         variantId:
 *           type: integer
 *           example: 4
 *         sku:
 *           type: string
 *           example: 'AH7382-107-40'
 *         productName:
 *           type: string
 *           example: 'Chuteira Nike Mercurial Vapor XII Pro FG'
 *         size:
 *           type: string
 *           nullable: true
 *           example: '40'
 *         color:
 *           type: string
 *           nullable: true
 *           example: 'Preto'
 *         type:
 *           type: string
 *           enum: [IN, OUT, ADJUST, RETURN, LOSS]
 *           example: 'IN'
 *         quantity:
 *           type: integer
 *           description: Delta assinado aplicado ao stock.
 *           example: 12
 *         resultQuantity:
 *           type: integer
 *           example: 12
 *         reason:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *     StoreReturnPolicy:
 *       type: object
 *       properties:
 *         enabled:
 *           type: boolean
 *           example: false
 *         windowDays:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           example: 15
 *         allowChangeOfMind:
 *           type: boolean
 *           example: true
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     StoreReturnPolicyInput:
 *       type: object
 *       required: [enabled, windowDays, allowChangeOfMind]
 *       properties:
 *         enabled:
 *           type: boolean
 *         windowDays:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *         allowChangeOfMind:
 *           type: boolean
 *     CreateStoreReturn:
 *       type: object
 *       required: [reason, description, items]
 *       properties:
 *         reason:
 *           type: string
 *           enum: [DEFECTIVE, WRONG_ITEM, NOT_AS_DESCRIBED, CHANGE_OF_MIND, OTHER]
 *         description:
 *           type: string
 *           minLength: 5
 *           maxLength: 1000
 *         items:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items:
 *             type: object
 *             required: [orderItemId, quantity]
 *             properties:
 *               orderItemId:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     ReviewStoreReturn:
 *       type: object
 *       required: [decision, note]
 *       properties:
 *         decision:
 *           type: string
 *           enum: [APPROVE, REJECT]
 *         note:
 *           type: string
 *           minLength: 3
 *           maxLength: 1000
 *     StoreReturnTracking:
 *       type: object
 *       required: [carrier, trackingCode]
 *       properties:
 *         carrier:
 *           type: string
 *           minLength: 2
 *           maxLength: 80
 *         trackingCode:
 *           type: string
 *           minLength: 2
 *           maxLength: 120
 *     ReceiveStoreReturn:
 *       type: object
 *       required: [items]
 *       properties:
 *         carrier:
 *           type: string
 *           maxLength: 80
 *         trackingCode:
 *           type: string
 *           maxLength: 120
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required: [orderItemId, quantityReceived]
 *             properties:
 *               orderItemId:
 *                 type: integer
 *               quantityReceived:
 *                 type: integer
 *                 minimum: 0
 *     InspectStoreReturn:
 *       type: object
 *       required: [items]
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required: [orderItemId, quantityAccepted, quantityRestocked]
 *             properties:
 *               orderItemId:
 *                 type: integer
 *               quantityAccepted:
 *                 type: integer
 *                 minimum: 0
 *               quantityRestocked:
 *                 type: integer
 *                 minimum: 0
 *               inspectionNote:
 *                 type: string
 *                 maxLength: 1000
 *     ManualStoreRefund:
 *       type: object
 *       required: [method, reference, note]
 *       properties:
 *         method:
 *           type: string
 *           minLength: 2
 *           maxLength: 60
 *         reference:
 *           type: string
 *           minLength: 3
 *           maxLength: 120
 *         note:
 *           type: string
 *           minLength: 3
 *           maxLength: 1000
 *     CloseStoreReturn:
 *       type: object
 *       required: [note]
 *       properties:
 *         note:
 *           type: string
 *           minLength: 3
 *           maxLength: 1000
 *     StoreReturnRequest:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         orderId:
 *           type: integer
 *         orderNumber:
 *           type: string
 *         customerId:
 *           type: integer
 *         reason:
 *           type: string
 *           enum: [DEFECTIVE, WRONG_ITEM, NOT_AS_DESCRIBED, CHANGE_OF_MIND, OTHER]
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [REQUESTED, APPROVED, REJECTED, RECEIVED, INSPECTED, REFUND_RECORDED, CLOSED]
 *         refundAmount:
 *           type: number
 *         refundMethod:
 *           type: string
 *           nullable: true
 *         refundReference:
 *           type: string
 *           nullable: true
 *         items:
 *           type: array
 *           items:
 *             type: object
 *         events:
 *           type: array
 *           items:
 *             type: object
 *     StoreMetrics:
 *       type: object
 *       properties:
 *         products:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 8
 *             active:
 *               type: integer
 *               example: 6
 *             draft:
 *               type: integer
 *               example: 1
 *             archived:
 *               type: integer
 *               example: 1
 *             categories:
 *               type: integer
 *               example: 5
 *             brands:
 *               type: integer
 *               example: 4
 *             variants:
 *               type: integer
 *               example: 12
 *         stock:
 *           type: object
 *           properties:
 *             units:
 *               type: integer
 *               example: 96
 *             reserved:
 *               type: integer
 *               example: 4
 *             available:
 *               type: integer
 *               example: 92
 *             lowStockItems:
 *               type: integer
 *               example: 2
 *             outOfStockItems:
 *               type: integer
 *               example: 1
 *             value:
 *               type: number
 *               format: double
 *               description: Valor do stock a preço de venda (Kz).
 *               example: 4850000
 */
export {};
