import { AuthAccount } from '../../domain/entities/auth-account.entity';

import { Email } from '../../domain/value-objects/email.vo';

import { PhoneNumber } from '../../domain/value-objects/phone-number.vo';

import { Password } from '../../domain/value-objects/password.vo';

import { AuthAccountId } from '../../domain/value-objects/auth-account-id.vo';

import { AuthProvider } from '../../domain/enums/auth-provider.enum';

import { AuthStatus } from '../../domain/enums/auth-status.enum';

import { AuthAccountRepository } from '../../domain/repositories/auth-account.repository';

import { VerificationTokenRepository } from '../../domain/repositories/verification-token.repository';

import { UserGateway } from '../../domain/gateways/user.gateway';

import { PasswordHasherPort } from '../ports/password-hasher.port';

import { EmailServicePort } from '../ports/email-service.port';

import { AuditServicePort } from '../ports/audit-service.port';
import { OtpServicePort } from '../ports/otp-service.port';
import { TokenType } from '../../domain/enums/token-type.enum';
import { UserType } from '../../../user/domain/enums/user-type.enum';
import { Role } from '../../domain/enums/role.enum';

export interface RegisterInput {
  name: string;

  email: string;

  phone: string;

  password: string;

  confirmPassword: string;

  acceptTerms: boolean;

  accountType: 'TEAM_OWNER' | 'FIELD_OWNER' | 'ORGANIZER';

  avatarUrl?: string;

  ipAddress?: string | null;

  userAgent?: string | null;
}

export interface RoleAssigner {
  assignRole(userId: number, roleName: string): Promise<void>;
}

export interface ProfileEnsurer {
  ensureProfile(userId: number, avatarUrl?: string): Promise<void>;
}

export interface RegisterResult {
  accountId: number;

  userId: number;

  email: string;

  phone: string;

  status: string;

  role: string;

  verificationChallengeId?: number;

  developmentCode?: string;
}

export class RegisterUseCase {
  constructor(
    private readonly authAccountRepository: AuthAccountRepository,

    private readonly userGateway: UserGateway,

    private readonly passwordHasher: PasswordHasherPort,

    private readonly verificationTokenRepository: VerificationTokenRepository,

    private readonly emailService: EmailServicePort,

    private readonly auditService: AuditServicePort,

    private readonly roleAssigner?: RoleAssigner,

    private readonly profileEnsurer?: ProfileEnsurer,

    private readonly otpService?: OtpServicePort,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterResult> {
    // ============================================================
    // 1. VALIDAR INPUT
    // ============================================================

    if (!input.name?.trim()) {
      throw new Error('Name is required.');
    }

    if (!input.email?.trim()) {
      throw new Error('Email is required.');
    }

    if (!input.phone?.trim()) {
      throw new Error('Phone number is required.');
    }

    if (!input.password) {
      throw new Error('Password is required.');
    }

    if (input.password.length < 8) {
      throw new Error('Password must contain at least 8 characters.');
    }

    if (!input.confirmPassword) {
      throw new Error('Password confirmation is required.');
    }

    if (input.password !== input.confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    if (input.acceptTerms !== true) {
      throw new Error('You must accept the terms and conditions.');
    }
    if (
      input.avatarUrl &&
      (!/^https:\/\//i.test(input.avatarUrl) || input.avatarUrl.length > 500)
    ) {
      throw new Error('Avatar URL must be a valid HTTPS URL of at most 500 characters.');
    }

    // Public signup only accepts end-user roles. Administrative roles
    // must be assigned through the administrative authorization flow.
    const accountTypes = {
      TEAM_OWNER: { userType: UserType.TEAM_OWNER, role: Role.TEAM_OWNER },
      FIELD_OWNER: { userType: UserType.FIELD_OWNER, role: Role.FIELD_OWNER },
      ORGANIZER: { userType: UserType.ORGANIZER, role: Role.ORGANIZER },
    } as const;
    const selectedType = input.accountType;
    if (!selectedType) throw new Error('Account type is required.');
    if (!Object.prototype.hasOwnProperty.call(accountTypes, selectedType)) {
      throw new Error('Invalid account type.');
    }
    const { userType, role: roleName } = accountTypes[selectedType];

    // ============================================================
    // 2. CRIAR VALUE OBJECT DO EMAIL
    // ============================================================

    const email = Email.create(input.email);

    const phone = PhoneNumber.create(input.phone);

    // ============================================================
    // 3. VERIFICAR SE JÁ EXISTE AUTH ACCOUNT
    // ============================================================

    const existingAccount = await this.authAccountRepository.findByEmail(email.getValue());

    if (existingAccount) {
      throw new Error('An authentication account already exists for this email.');
    }

    // ============================================================
    // 4. VERIFICAR SE JÁ EXISTE USER
    // ============================================================

    const existingUser = await this.userGateway.findByEmail(email.getValue());

    if (existingUser) {
      throw new Error('A user already exists for this email.');
    }

    // ============================================================
    // 4b. VERIFICAR SE JÁ EXISTE USER COM O TELEFONE
    // ============================================================

    const existingUserByPhone = await this.userGateway.findByPhone(phone.getValue());

    if (existingUserByPhone) {
      throw new Error('A user already exists for this phone number.');
    }

    // ============================================================
    // 5. CRIAR USER
    // ============================================================

    const user = await this.userGateway.createUser({
      name: input.name,

      email: email.getValue(),

      phone: phone.getValue(),

      termsAcceptedAt: new Date(),

      userType,
    });

    // ============================================================
    // 6. VALIDAR ID GERADO
    // ============================================================

    if (!user.id || user.id <= 0) {
      throw new Error('User creation failed: invalid user ID.');
    }

    // ============================================================
    // 7. GERAR HASH DA PASSWORD
    // ============================================================

    const passwordHash = await this.passwordHasher.hash(input.password);

    // ============================================================
    // 8. CRIAR VALUE OBJECT DA PASSWORD
    // ============================================================

    const password = Password.fromHash(passwordHash);

    // ============================================================
    // 9. CRIAR AUTH ACCOUNT
    // ============================================================

    const account = AuthAccount.create({
      id: AuthAccountId.temporary(),

      userId: user.id,

      email,

      password,

      provider: AuthProvider.LOCAL,

      providerAccountId: null,

      status: AuthStatus.PENDING_VERIFICATION,

      roles: [],

      emailVerifiedAt: null,

      failedLoginAttempts: 0,

      lockedUntil: null,

      lastLoginAt: null,

      createdAt: new Date(),

      updatedAt: new Date(),
    });

    // ============================================================
    // 10. GUARDAR AUTH ACCOUNT
    // ============================================================

    const saved = await this.authAccountRepository.save(account);

    // ============================================================
    // 10b. ATRIBUIR ROLE CONFORME O TIPO DE CONTA
    // ============================================================

    if (this.roleAssigner) {
      await this.roleAssigner.assignRole(user.id, roleName);
    }

    // ============================================================
    // 10c. GERAR PERFIL DO UTILIZADOR
    // ============================================================

    if (this.profileEnsurer) {
      await this.profileEnsurer.ensureProfile(user.id, input.avatarUrl);
    }

    await this.verificationTokenRepository.invalidateActive(
      saved.id.getValue(),
      TokenType.EMAIL_VERIFICATION_OTP,
      new Date(),
    );
    const code = this.otpService?.generateCode();
    const now = new Date();
    const challenge =
      code && this.otpService
        ? await this.verificationTokenRepository.createOtp({
            authAccountId: saved.id.getValue(),
            codeHash: this.otpService.hash(code),
            channel: 'email',
            destination: email.getValue(),
            expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
            type: TokenType.EMAIL_VERIFICATION_OTP,
          })
        : null;
    const verificationToken = !challenge
      ? await this.verificationTokenRepository.create({
          authAccountId: saved.id.getValue(),
          type: 'EMAIL_VERIFICATION',
        })
      : null;

    // ============================================================
    // 11. ENVIAR EMAIL DE VERIFICAÇÃO
    // ============================================================

    await this.emailService.send({
      to: email.getValue(),

      subject: 'Verify your email',

      template: 'email-verification',

      variables: {
        userId: user.id,

        accountId: saved.id.getValue(),

        token: verificationToken?.value,
        code,
        expiresAt: challenge ? new Date(now.getTime() + 10 * 60 * 1000) : undefined,
      },
    });

    // ============================================================
    // 12. REGISTRAR AUDITORIA
    // ============================================================

    await this.auditService.record({
      userId: user.id,

      action: 'USER_REGISTERED',

      resource: 'auth-account',

      resourceId: String(saved.id),

      ipAddress: input.ipAddress ?? null,

      userAgent: input.userAgent ?? null,
    });

    // ============================================================
    // 13. RETORNAR RESULTADO
    // ============================================================

    return {
      accountId: saved.id.getValue(),

      userId: user.id,

      email: saved.email.getValue(),

      phone: phone.getValue(),

      status: saved.status,

      role: roleName,

      verificationChallengeId: challenge?.id,
      ...(code && process.env.NODE_ENV !== 'production' ? { developmentCode: code } : {}),
    };
  }
}
