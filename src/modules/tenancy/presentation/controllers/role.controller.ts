import { Request, Response } from 'express';

import { ListCompanyRolesUseCase } from '../../application/use-cases/list-company-roles.use-case';
import { CreateCompanyRoleUseCase } from '../../application/use-cases/create-company-role.use-case';
import { UpdateCompanyRoleUseCase } from '../../application/use-cases/update-company-role.use-case';
import { DeleteCompanyRoleUseCase } from '../../application/use-cases/delete-company-role.use-case';
import { SetCompanyRolePermissionsUseCase } from '../../application/use-cases/set-company-role-permissions.use-case';
import { CreateRoleDto, UpdateRoleDto, SetRolePermissionsDto } from '../schemas/role.schema';

/** Controllers de papéis da empresa (âmbito sempre `req.tenant`). */
export class RoleController {
  constructor(
    private readonly listCompanyRolesUseCase: ListCompanyRolesUseCase,
    private readonly createCompanyRoleUseCase: CreateCompanyRoleUseCase,
    private readonly updateCompanyRoleUseCase: UpdateCompanyRoleUseCase,
    private readonly deleteCompanyRoleUseCase: DeleteCompanyRoleUseCase,
    private readonly setCompanyRolePermissionsUseCase: SetCompanyRolePermissionsUseCase,
  ) {}

  /** GET /api/v1/company/roles */
  async list(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);

    if (!companyId) {
      return;
    }

    const result = await this.listCompanyRolesUseCase.execute(companyId);

    res.status(200).json({
      success: true,
      data: result.data,
    });
  }

  /** POST /api/v1/company/roles */
  async create(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);
    const actorUserId = req.user?.userId;

    if (!companyId) {
      return;
    }

    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as CreateRoleDto;

    const role = await this.createCompanyRoleUseCase.execute({
      companyId,
      actorUserId,
      name: body.name,
      description: body.description ?? null,
      permissionNames: body.permissionNames,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(201).json({
      success: true,
      data: role,
    });
  }

  /** PATCH /api/v1/company/roles/:id */
  async update(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);
    const actorUserId = req.user?.userId;

    if (!companyId) {
      return;
    }

    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as UpdateRoleDto;

    const role = await this.updateCompanyRoleUseCase.execute({
      companyId,
      roleId: Number(req.params.id),
      actorUserId,
      name: body.name ?? '',
      description: body.description,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      success: true,
      data: role,
    });
  }

  /** DELETE /api/v1/company/roles/:id */
  async remove(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);
    const actorUserId = req.user?.userId;

    if (!companyId) {
      return;
    }

    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const result = await this.deleteCompanyRoleUseCase.execute({
      companyId,
      roleId: Number(req.params.id),
      actorUserId,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  /** PUT /api/v1/company/roles/:id/permissions */
  async setPermissions(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);
    const actorUserId = req.user?.userId;

    if (!companyId) {
      return;
    }

    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as SetRolePermissionsDto;

    const role = await this.setCompanyRolePermissionsUseCase.execute({
      companyId,
      roleId: Number(req.params.id),
      actorUserId,
      permissionNames: body.permissionNames,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      success: true,
      data: role,
    });
  }

  private requireCompany(res: Response): number | null {
    const companyId = res.req.tenant?.companyId;

    if (!companyId) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Company context is required.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
      });

      return null;
    }

    return companyId;
  }
}
