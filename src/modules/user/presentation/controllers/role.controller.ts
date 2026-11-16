import { Request, Response } from 'express';

import { AssignRoleUseCase } from '../../application/use-cases/assign-role.use-case';
import { RemoveRoleUseCase } from '../../application/use-cases/remove-role.use-case';
import { GetUserRolesUseCase } from '../../application/use-cases/get-user-roles.use-case';

import { AssignRoleDTO } from '../dto/assign-role.dto';
import { RemoveRoleDTO } from '../dto/remove-role.dto';

export class RoleController {
  constructor(
    private readonly assignRoleUseCase: AssignRoleUseCase,
    private readonly removeRoleUseCase: RemoveRoleUseCase,
    private readonly getUserRolesUseCase: GetUserRolesUseCase,
  ) {}

  async assign(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.userId);

    const input: AssignRoleDTO = {
      userId,
      roleId: Number(req.body.roleId),
    };

    const result = await this.assignRoleUseCase.execute(input);

    return res.status(200).json(result);
  }

  async remove(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.userId);

    const input: RemoveRoleDTO = {
      userId,
      roleId: Number(req.body.roleId),
    };

    const result = await this.removeRoleUseCase.execute(input);

    return res.status(200).json(result);
  }

  async getUserRoles(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.userId);

    const roles = await this.getUserRolesUseCase.execute({
      userId,
    });

    return res.status(200).json(roles);
  }
}
