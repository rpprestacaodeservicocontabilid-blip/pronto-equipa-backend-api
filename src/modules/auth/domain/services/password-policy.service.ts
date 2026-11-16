export interface PasswordPolicyService {
  validate(password: string): PasswordPolicyResult;
}

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}
