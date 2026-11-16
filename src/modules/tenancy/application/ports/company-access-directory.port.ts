/** Identity and role information required by membership use cases. */
export interface CompanyAccessDirectoryPort {
  userExists(userId: number): Promise<boolean>;
  administrativeRoleIds(companyId: number): Promise<number[]>;
  globalAdminRoleId(): Promise<number>;
}
