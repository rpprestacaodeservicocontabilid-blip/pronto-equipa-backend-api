import { Request, Response } from 'express';

import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { GetUserByIdUseCase } from '../../application/use-cases/get-user-by-id.use-case';
import { GetUserByEmailUseCase } from '../../application/use-cases/get-user-by-email.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';
import { ActivateUserUseCase } from '../../application/use-cases/activate-user.use-case';
import { DeactivateUserUseCase } from '../../application/use-cases/deactivate-user.use-case';

import { CreateUserDTO } from '../dto/create-user.dto';
import { UpdateUserDTO } from '../dto/update-user.dto';

export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly getUserByIdUseCase: GetUserByIdUseCase,
    private readonly getUserByEmailUseCase: GetUserByEmailUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly activateUserUseCase: ActivateUserUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
  ) {}

  async create(req: Request, res: Response): Promise<Response> {
    const input: CreateUserDTO = req.body;

    const user = await this.createUserUseCase.execute(input);

    return res.status(201).json(user);
  }

  async getById(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.id);

    const user = await this.getUserByIdUseCase.execute({
      userId,
    });

    return res.status(200).json(user);
  }

  async getByEmail(req: Request, res: Response): Promise<Response> {
    const { email } = req.query;

    const user = await this.getUserByEmailUseCase.execute({
      email: String(email),
    });

    return res.status(200).json(user);
  }

  async update(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.id);

    const input: UpdateUserDTO = req.body;

    const user = await this.updateUserUseCase.execute({
      userId,
      ...input,
    });

    return res.status(200).json(user);
  }

  async delete(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.id);

    await this.deleteUserUseCase.execute({
      userId,
    });

    return res.status(204).send();
  }

  async activate(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.id);

    const user = await this.activateUserUseCase.execute({
      userId,
    });

    return res.status(200).json(user);
  }

  async deactivate(req: Request, res: Response): Promise<Response> {
    const userId = Number(req.params.id);

    const user = await this.deactivateUserUseCase.execute({
      userId,
    });

    return res.status(200).json(user);
  }
}
