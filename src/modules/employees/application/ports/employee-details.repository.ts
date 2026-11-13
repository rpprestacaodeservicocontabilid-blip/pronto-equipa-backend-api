export interface EmployeeDependentInput {
  companyId: number;
  employeeId: string;
  fullName: string;
  relationship: string;
  dateOfBirth: Date | null;
  fiscalDependent: boolean;
}

export interface EmployeeDependentView extends EmployeeDependentInput {
  id: string;
  createdAt: Date;
}

export interface EmployeeBankAccountInput {
  companyId: number;
  employeeId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string | null;
  currency: string;
}

export interface EmployeeDetailsRepository {
  listDependents(companyId: number, employeeId: string): Promise<EmployeeDependentView[] | null>;
  addDependent(input: EmployeeDependentInput): Promise<EmployeeDependentView | null>;
  getBankAccount(
    companyId: number,
    employeeId: string,
  ): Promise<Omit<EmployeeBankAccountInput, 'companyId' | 'employeeId'> | null>;
  setBankAccount(input: EmployeeBankAccountInput): Promise<boolean>;
}
