export type AuthorizationContext =
  | { readonly type: 'tenant'; readonly tenantId: number }
  | { readonly type: 'platform' };

export class AuthorizationScope {
  private constructor(readonly context: AuthorizationContext) {}

  static tenant(tenantId: number): AuthorizationScope {
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
      throw new Error('A valid tenant ID is required.');
    }

    return new AuthorizationScope({ type: 'tenant', tenantId });
  }

  static platform(): AuthorizationScope {
    return new AuthorizationScope({ type: 'platform' });
  }

  equals(other: AuthorizationScope): boolean {
    return (
      this.context.type === other.context.type &&
      (this.context.type !== 'tenant' ||
        (other.context.type === 'tenant' && this.context.tenantId === other.context.tenantId))
    );
  }
}
