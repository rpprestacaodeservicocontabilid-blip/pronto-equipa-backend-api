import {
  UserGateway,
  AuthUserData,
  CreateAuthUserInput,
} from '../../../domain/gateways/user.gateway';

import { User } from '../../../../user/domain/entities/user.entity';
import { UserRepository } from '../../../../user/domain/repositories/user.repository';

export class UserGatewayImpl implements UserGateway {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(userId: number): Promise<AuthUserData | null> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      return null;
    }

    return this.toAuthUserData(user);
  }

  async findByEmail(email: string): Promise<AuthUserData | null> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return null;
    }

    return this.toAuthUserData(user);
  }

  async findByPhone(phone: string): Promise<AuthUserData | null> {
    const user = await this.userRepository.findByPhone(phone);

    if (!user) {
      return null;
    }

    return this.toAuthUserData(user);
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthUserData> {
    const user = User.register({
      name: input.name,
      email: input.email,
      phone: input.phone,
      termsAcceptedAt: input.termsAcceptedAt ?? null,
      type: input.userType as
        | import('../../../../user/domain/enums/user-type.enum').UserType
        | undefined,
    });

    const savedUser = await this.userRepository.save(user);

    return this.toAuthUserData(savedUser);
  }

  async updateEmail(userId: number, email: string): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new Error('User not found.');
    }

    user.changeEmail(email);

    await this.userRepository.update(user);
  }

  private toAuthUserData(user: User): AuthUserData {
    return {
      id: user.id.getValue(),
      name: user.name.getValue(),
      email: user.email.getValue(),
      phone: user.phone ? user.phone.getValue() : null,
      active: user.isActive(),
    };
  }
}
