import { UserRepository } from '../../domain/repositories/user.repository';
import { PermissionRepository } from '../../domain/repositories/permission.repository';
import { PermissionService } from '../../domain/services/permission.service';
import { EventPublisher } from '../../domain/events/event-publisher.port';

export interface AssignPermissionInput {
  userId: number;
  permissionId: number;
  assignedBy?: number;
}

export class AssignPermissionUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly permissionRepository: PermissionRepository,
    private readonly permissionService: PermissionService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: AssignPermissionInput) {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new Error('User not found.');
    }

    const permission = await this.permissionRepository.findById(input.permissionId);

    if (!permission) {
      throw new Error('Permission not found.');
    }

    await this.permissionService.assign(user, permission, input.assignedBy ?? null);

    await this.permissionRepository.assignToUser(
      input.userId,
      input.permissionId,
      input.assignedBy ?? null,
    );

    await this.userRepository.save(user);

    await this.eventPublisher.publishMany(user.pullDomainEvents());

    return {
      userId: user.id,
      permissionId: permission.id,
      permissionName: permission.name,
    };
  }
}
