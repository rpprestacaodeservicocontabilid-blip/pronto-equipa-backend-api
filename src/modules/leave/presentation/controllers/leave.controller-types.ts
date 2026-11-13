import { z } from 'zod';
import {
  accrueEntitlementSchema,
  adjustBalanceSchema,
  approveLeaveSchema,
  completeLeaveSchema,
  createLeaveRequestSchema,
  interruptLeaveSchema,
  recalculateEntitlementsSchema,
  rejectLeaveSchema,
  rescheduleLeaveSchema,
  returnLeaveSchema,
  submitLeaveSchema,
  updateLeaveRequestSchema,
  versionOnlySchema,
} from '../schemas/leave.schema';

/**
 * DTOs do controlador derivados dos schemas Zod — qualquer
 * alteração de validação reflecte-se automaticamente nos tipos.
 */
export type AccrueEntitlementInput = z.infer<typeof accrueEntitlementSchema>;
export type RecalculateEntitlementsInput = z.infer<typeof recalculateEntitlementsSchema>;
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
export type CreateLeaveInput = z.infer<typeof createLeaveRequestSchema>;
export type UpdateLeaveInput = z.infer<typeof updateLeaveRequestSchema>;
export type SubmitLeaveInput = z.infer<typeof submitLeaveSchema>;
export type ApproveLeaveInput = z.infer<typeof approveLeaveSchema>;
export type RejectLeaveInput = z.infer<typeof rejectLeaveSchema>;
export type ReturnLeaveInput = z.infer<typeof returnLeaveSchema>;
export type VersionInput = z.infer<typeof versionOnlySchema>;
export type RescheduleLeaveInput = z.infer<typeof rescheduleLeaveSchema>;
export type InterruptLeaveInput = z.infer<typeof interruptLeaveSchema>;
export type CompleteLeaveInput = z.infer<typeof completeLeaveSchema>;
