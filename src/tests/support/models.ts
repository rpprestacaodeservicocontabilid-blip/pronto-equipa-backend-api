import { AUDIT_ENGINE_MODELS } from '../../modules/audit/infrastructure/persistence/models/audit-engine.models';
import type { SyncOptions } from 'sequelize';
import { PAYROLL_WORKFLOW_MODELS } from '../../modules/payroll/infrastructure/persistence/models/payroll-workflow.models';
import {
  PayrollPeriodModel,
  PayrollRunModel,
  PayrollEmployeeResultModel,
  PayrollInputSnapshotModel,
  PayrollOutboxModel,
} from '../../modules/payroll/infrastructure/persistence/models/payroll.models';

// ============================================================
// MODELOS SINCRONIZADOS NOS TESTES
// ============================================================
//
// Uma tabela por modelo (sem duplicados) — dois módulos declaram
// classes distintas para as MESMAS tabelas:
//
//   `user_roles`      → auth `UserRoleModel` e user `UserRoleModel`
//   `role_permissions`→ auth `RolePermissionModel` e user `RolePermissionModel`
//
// Escolhem-se as do módulo auth porque reproduzem o esquema real
// (chave primária `id` + índice único), tal como as migrações.
//
// As duas primeiro para que `role_permissions`/`user_roles` existam
// antes de qualquer modelo que delas dependa.

import { UserRoleModel as AuthUserRoleModel } from '../../modules/auth/infrastructure/persistence/models/user-role.model';
import { RolePermissionModel as AuthRolePermissionModel } from '../../modules/auth/infrastructure/persistence/models/role-permission.model';

import { UserModel } from '../../modules/user/infrastructure/persistence/models/user.model';
import { UserProfileModel } from '../../modules/user/infrastructure/persistence/models/user-profile.model';
import { UserPermissionModel } from '../../modules/user/infrastructure/persistence/models/user-permission.model';
import { RoleModel } from '../../modules/user/infrastructure/persistence/models/role.model';
import { PermissionModel } from '../../modules/user/infrastructure/persistence/models/permission.model';

import { CompanyModel } from '../../modules/tenancy/infrastructure/persistence/models/company.model';
import { CompanyMemberModel } from '../../modules/tenancy/infrastructure/persistence/models/company-member.model';

import { AuditLogModel } from '../../modules/audit/infrastructure/persistence/models/audit-log.model';

import { AuthAccountModel } from '../../modules/auth/infrastructure/persistence/models/auth-account.model';
import { SessionModel } from '../../modules/auth/infrastructure/persistence/models/session.model';
import { RefreshTokenModel } from '../../modules/auth/infrastructure/persistence/models/refresh-token.model';
import { RoleModel as AuthRoleModel } from '../../modules/auth/infrastructure/persistence/models/role.model';
import { PermissionModel as AuthPermissionModel } from '../../modules/auth/infrastructure/persistence/models/permission.model';
import { PasswordResetTokenModel } from '../../modules/auth/infrastructure/persistence/models/password-reset-token.model';
import { VerificationTokenModel } from '../../modules/auth/infrastructure/persistence/models/verification-token.model';
import { EmployeeModel } from '../../modules/employees/infrastructure/persistence/models/employee.model';
import { EmployeeProfessionalHistoryModel } from '../../modules/employees/infrastructure/persistence/models/employee-professional-history.model';
import { EmployeeStatusHistoryModel } from '../../modules/employees/infrastructure/persistence/models/employee-status-history.model';
import { EmployeeDependentModel } from '../../modules/employees/infrastructure/persistence/models/employee-dependent.model';
import { EmployeeBankAccountModel } from '../../modules/employees/infrastructure/persistence/models/employee-bank-account.model';
import { EmploymentContractModel } from '../../modules/contracts/infrastructure/persistence/models/employment-contract.model';
import { ContractRecordModel } from '../../modules/contracts/infrastructure/persistence/models/contract-record.model';
import { ContractTypeModel } from '../../modules/contracts/infrastructure/persistence/models/contract-type.model';
import { ContractOutboxModel } from '../../modules/contracts/infrastructure/persistence/models/contract-outbox.model';
import { ContractAlertModel } from '../../modules/contracts/infrastructure/persistence/models/contract-alert.model';
import { OrganizationRecordModel } from '../../modules/organization/infrastructure/persistence/models/organization-record.model';
import { OrganizationHistoryModel } from '../../modules/organization/infrastructure/persistence/models/organization-history.model';
import { OrganizationOutboxModel } from '../../modules/organization/infrastructure/persistence/models/organization-outbox.model';
import { LeaveAccountModel } from '../../modules/leave/infrastructure/persistence/models/leave-account.model';
import { LeaveEntitlementModel } from '../../modules/leave/infrastructure/persistence/models/leave-entitlement.model';
import { LeaveBalanceMovementModel } from '../../modules/leave/infrastructure/persistence/models/leave-balance-movement.model';
import { LeaveRequestModel } from '../../modules/leave/infrastructure/persistence/models/leave-request.model';
import { LeaveRequestPeriodModel } from '../../modules/leave/infrastructure/persistence/models/leave-request-period.model';
import { LeaveApprovalModel } from '../../modules/leave/infrastructure/persistence/models/leave-approval.model';
import { LeaveInterruptionModel } from '../../modules/leave/infrastructure/persistence/models/leave-interruption.model';
import { LeaveOutboxModel } from '../../modules/leave/infrastructure/persistence/models/leave-outbox.model';
import { AttendanceRecordModel } from '../../modules/attendance/infrastructure/persistence/models/attendance-record.model';
import { AttendanceEntityModel } from '../../modules/attendance/infrastructure/persistence/models/attendance-entity.model';
import { AttendanceOutboxModel } from '../../modules/attendance/infrastructure/persistence/models/attendance-outbox.model';
import { LoanApplicationModel } from '../../modules/loans/infrastructure/persistence/models/loan-application.model';
import { LoanApprovalModel } from '../../modules/loans/infrastructure/persistence/models/loan-approval.model';
import { EmployeeLoanModel } from '../../modules/loans/infrastructure/persistence/models/employee-loan.model';
import { LoanPolicyModel } from '../../modules/loans/infrastructure/persistence/models/loan-policy.model';
import { RepaymentPlanModel } from '../../modules/loans/infrastructure/persistence/models/repayment-plan.model';
import { LoanInstallmentModel } from '../../modules/loans/infrastructure/persistence/models/loan-installment.model';
import { LoanDisbursementModel } from '../../modules/loans/infrastructure/persistence/models/loan-disbursement.model';
import { LoanRepaymentModel } from '../../modules/loans/infrastructure/persistence/models/loan-repayment.model';
import { LoanLedgerEntryModel } from '../../modules/loans/infrastructure/persistence/models/loan-ledger-entry.model';
import { LoanDeductionModel } from '../../modules/loans/infrastructure/persistence/models/loan-deduction.model';
import { LoanRenegotiationModel } from '../../modules/loans/infrastructure/persistence/models/loan-renegotiation.model';
import { LoanOutboxModel } from '../../modules/loans/infrastructure/persistence/models/loan-outbox.model';
import {
  EmployeeSalaryAssignmentModel,
  EmployeeSalaryComponentModel,
  SalaryComponentModel,
  SalaryComponentVersionModel,
  SalaryGradeModel,
  SalaryOutboxModel,
  SalaryPolicyModel,
  SalaryRevisionBatchModel,
  SalaryRevisionItemModel,
  SalaryRevisionModel,
  SalarySnapshotModel,
  SalaryStepModel,
  SalaryStructureItemModel,
  SalaryStructureModel,
  SalaryStructureVersionModel,
  SalaryTableModel,
  SalaryTableVersionModel,
} from '../../modules/salary-structure/infrastructure/persistence/models/salary-structure.models';

/** Contrato mínimo usado por `resetTestDatabase()`. */
export interface SyncableModel {
  sync(options?: SyncOptions): Promise<unknown>;
}

/**
 * Modelos criados (e por isso tabelas existentes) nos testes.
 * A ordem é irrelevante para as FKs (os modelos não as declaram),
 * mas mantém as tabelas de associação primeiro.
 */
export const TEST_MODELS: readonly SyncableModel[] = [
  AuthUserRoleModel,
  AuthRolePermissionModel,
  UserModel,
  UserProfileModel,
  UserPermissionModel,
  RoleModel,
  PermissionModel,
  CompanyModel,
  CompanyMemberModel,
  AuditLogModel,
  ...AUDIT_ENGINE_MODELS,
  AuthAccountModel,
  SessionModel,
  RefreshTokenModel,
  AuthRoleModel,
  AuthPermissionModel,
  PasswordResetTokenModel,
  VerificationTokenModel,
  EmployeeModel,
  EmployeeProfessionalHistoryModel,
  EmployeeStatusHistoryModel,
  EmployeeDependentModel,
  EmployeeBankAccountModel,
  ContractTypeModel,
  EmploymentContractModel,
  ContractRecordModel,
  ContractOutboxModel,
  ContractAlertModel,
  OrganizationRecordModel,
  OrganizationHistoryModel,
  OrganizationOutboxModel,
  LeaveAccountModel,
  LeaveEntitlementModel,
  LeaveBalanceMovementModel,
  LeaveRequestModel,
  LeaveRequestPeriodModel,
  LeaveApprovalModel,
  LeaveInterruptionModel,
  LeaveOutboxModel,
  AttendanceRecordModel,
  AttendanceEntityModel,
  AttendanceOutboxModel,
  LoanApplicationModel,
  LoanApprovalModel,
  EmployeeLoanModel,
  LoanPolicyModel,
  RepaymentPlanModel,
  LoanInstallmentModel,
  LoanDisbursementModel,
  LoanRepaymentModel,
  LoanLedgerEntryModel,
  LoanDeductionModel,
  LoanRenegotiationModel,
  LoanOutboxModel,
  SalaryComponentModel,
  SalaryComponentVersionModel,
  SalaryTableModel,
  SalaryTableVersionModel,
  SalaryGradeModel,
  SalaryStepModel,
  SalaryStructureModel,
  SalaryStructureVersionModel,
  SalaryStructureItemModel,
  EmployeeSalaryAssignmentModel,
  EmployeeSalaryComponentModel,
  SalaryRevisionModel,
  SalaryRevisionBatchModel,
  SalaryRevisionItemModel,
  SalaryPolicyModel,
  SalarySnapshotModel,
  SalaryOutboxModel,
  PayrollPeriodModel,
  PayrollRunModel,
  PayrollEmployeeResultModel,
  PayrollInputSnapshotModel,
  PayrollOutboxModel,
  ...PAYROLL_WORKFLOW_MODELS,
];
