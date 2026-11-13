export interface PlatformPermissionCheckerPort {
  hasPermission(userId: number, permission: string): Promise<boolean>;
}
