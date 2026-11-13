export interface PlatformRoleCheckerPort {
  hasAnyRole(userId: number, roles: readonly string[]): Promise<boolean>;
}
