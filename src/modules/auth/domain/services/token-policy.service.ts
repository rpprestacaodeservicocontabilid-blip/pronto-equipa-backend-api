import { TokenType } from "../enums/token-type.enum";

export interface TokenPolicyService {
  getExpiration(
    type: TokenType,
  ): number;

  isValid(
    type: TokenType,
    createdAt: Date,
    expiresAt: Date,
    now?: Date,
  ): boolean;
}