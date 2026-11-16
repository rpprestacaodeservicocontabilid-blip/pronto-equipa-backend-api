import { User } from '../../domain/entities/user.entity';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserValidationService } from '../../domain/services/user-validation.service';
import { EventPublisher } from '../../domain/events/event-publisher.port';
import { Email } from '../../domain/value-objects/email.vo';
import { UserName } from '../../domain/value-objects/user-name.vo';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { Phone } from '../../domain/value-objects/phone.vo';
import { UserType } from '../../domain/enums/user-type.enum';
import { UserStatus } from '../../domain/enums/user-status.enum';

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string | null;

  type?: string;

  profile?: {
    type?: string;
    bio?: string | null;
    avatar?: string | null;
  };
}

export interface CreateUserOutput {
  id: number;
  name: string;
  email: string;
  status: string;
}

export class CreateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly validationService: UserValidationService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    await this.validationService.validateCreate(input);

    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new Error('A user with this email already exists.');
    }

    const user = User.create({
      id: UserId.temporary(), // ID will be assigned by repository
      name: UserName.create(input.name),
      email: Email.create(input.email),
      phone: input.phone ? Phone.create(input.phone) : null,
      type: (input.type as UserType) || UserType.PLAYER,
      status: UserStatus.INACTIVE,
      profileId: null,
      emailVerifiedAt: null,
      termsAcceptedAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.userRepository.save(user);

    const event = user.pullDomainEvents();

    await this.eventPublisher.publishMany(event);

    const primitives = user.toPrimitives();

    return {
      id: primitives.id as number,
      name: primitives.name as string,
      email: primitives.email as string,
      status: primitives.status,
    };
  }
}
