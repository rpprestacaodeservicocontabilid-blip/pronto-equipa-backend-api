import type { SyncOptions } from 'sequelize';
import { PAYROLL_WORKFLOW_MODELS } from '../../modules/payroll/infrastructure/payroll-workflow.models';
import { PayrollPeriodModel, PayrollRunModel, PayrollEmployeeResultModel, PayrollInputSnapshotModel, PayrollOutboxModel } from '../../modules/payroll/infrastructure/payroll.models';

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

import { UserRoleModel as AuthUserRoleModel } from '../../modules/auth/infrastructure/persistence/model/user-role.model';
import { RolePermissionModel as AuthRolePermissionModel } from '../../modules/auth/infrastructure/persistence/model/role-permission.model';

import { UserModel } from '../../modules/user/infrastructure/persistence/models/user.model';
import { UserProfileModel } from '../../modules/user/infrastructure/persistence/models/user-profile.model';
import { UserPermissionModel } from '../../modules/user/infrastructure/persistence/models/user-permission.model';
import { RoleModel } from '../../modules/user/infrastructure/persistence/models/role.model';
import { PermissionModel } from '../../modules/user/infrastructure/persistence/models/permission.model';

import { CompanyModel } from '../../modules/tenancy/infrastructure/persistence/model/company.model';
import { CompanyMemberModel } from '../../modules/tenancy/infrastructure/persistence/model/company-member.model';

import { AuditLogModel } from '../../modules/audit/infrastructure/persistence/model/audit-log.model';

import { AuthAccountModel } from '../../modules/auth/infrastructure/persistence/model/auth-account.model';
import { SessionModel } from '../../modules/auth/infrastructure/persistence/model/session.model';
import { RefreshTokenModel } from '../../modules/auth/infrastructure/persistence/model/refresh-token.model';
import { RoleModel as AuthRoleModel } from '../../modules/auth/infrastructure/persistence/model/role.model';
import { PermissionModel as AuthPermissionModel } from '../../modules/auth/infrastructure/persistence/model/permission.model';
import { PasswordResetTokenModel } from '../../modules/auth/infrastructure/persistence/model/password-reset-token.model';
import { VerificationTokenModel } from '../../modules/auth/infrastructure/persistence/model/verification-token.model';
import { EmployeeModel } from '../../modules/employees/infrastructure/persistence/model/employee.model';
import { EmployeeProfessionalHistoryModel } from '../../modules/employees/infrastructure/persistence/model/employee-professional-history.model';
import { EmployeeStatusHistoryModel } from '../../modules/employees/infrastructure/persistence/model/employee-status-history.model';
import { EmployeeDependentModel } from '../../modules/employees/infrastructure/persistence/model/employee-dependent.model';
import { EmployeeBankAccountModel } from '../../modules/employees/infrastructure/persistence/model/employee-bank-account.model';
import { EmploymentContractModel } from '../../modules/contracts/infrastructure/persistence/model/employment-contract.model';
import { ContractRecordModel } from '../../modules/contracts/infrastructure/persistence/model/contract-record.model';
import { ContractTypeModel } from '../../modules/contracts/infrastructure/persistence/model/contract-type.model';
import { ContractOutboxModel } from '../../modules/contracts/infrastructure/persistence/model/contract-outbox.model';
import { ContractAlertModel } from '../../modules/contracts/infrastructure/persistence/model/contract-alert.model';
import { OrganizationRecordModel } from '../../modules/organization/infrastructure/persistence/model/organization-record.model';
import { OrganizationHistoryModel } from '../../modules/organization/infrastructure/persistence/model/organization-history.model';
import { OrganizationOutboxModel } from '../../modules/organization/infrastructure/persistence/model/organization-outbox.model';
import { LeaveAccountModel } from '../../modules/leave/infrastructure/persistence/model/leave-account.model';
import { LeaveEntitlementModel } from '../../modules/leave/infrastructure/persistence/model/leave-entitlement.model';
import { LeaveBalanceMovementModel } from '../../modules/leave/infrastructure/persistence/model/leave-balance-movement.model';
import { LeaveRequestModel } from '../../modules/leave/infrastructure/persistence/model/leave-request.model';
import { LeaveRequestPeriodModel } from '../../modules/leave/infrastructure/persistence/model/leave-request-period.model';
import { LeaveApprovalModel } from '../../modules/leave/infrastructure/persistence/model/leave-approval.model';
import { LeaveInterruptionModel } from '../../modules/leave/infrastructure/persistence/model/leave-interruption.model';
import { LeaveOutboxModel } from '../../modules/leave/infrastructure/persistence/model/leave-outbox.model';
import { AttendanceRecordModel } from '../../modules/attendance/infrastructure/persistence/model/attendance-record.model';
import { AttendanceEntityModel } from '../../modules/attendance/infrastructure/persistence/model/attendance-entity.model';
import { AttendanceOutboxModel } from '../../modules/attendance/infrastructure/persistence/model/attendance-outbox.model';
import { LoanApplicationModel } from '../../modules/loans/infrastructure/persistence/model/loan-application.model';
import { LoanApprovalModel } from '../../modules/loans/infrastructure/persistence/model/loan-approval.model';
import { EmployeeLoanModel } from '../../modules/loans/infrastructure/persistence/model/employee-loan.model';
import { LoanPolicyModel } from '../../modules/loans/infrastructure/persistence/model/loan-policy.model';
import { RepaymentPlanModel } from '../../modules/loans/infrastructure/persistence/model/repayment-plan.model';
import { LoanInstallmentModel } from '../../modules/loans/infrastructure/persistence/model/loan-installment.model';
import { LoanDisbursementModel } from '../../modules/loans/infrastructure/persistence/model/loan-disbursement.model';
import { LoanRepaymentModel } from '../../modules/loans/infrastructure/persistence/model/loan-repayment.model';
import { LoanLedgerEntryModel } from '../../modules/loans/infrastructure/persistence/model/loan-ledger-entry.model';
import { LoanDeductionModel } from '../../modules/loans/infrastructure/persistence/model/loan-deduction.model';
import { LoanRenegotiationModel } from '../../modules/loans/infrastructure/persistence/model/loan-renegotiation.model';
import { LoanOutboxModel } from '../../modules/loans/infrastructure/persistence/model/loan-outbox.model';
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
} from '../../modules/salary-structure/infrastructure/persistence/model/salary-structure.models';

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
