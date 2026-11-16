import { Request, Response } from 'express';

import { ListMembersUseCase } from '../../application/use-cases/list-members.use-case';
import { AddMemberUseCase } from '../../application/use-cases/add-member.use-case';
import { UpdateMemberUseCase } from '../../application/use-cases/update-member.use-case';
import { RemoveMemberUseCase } from '../../application/use-cases/remove-member.use-case';
import { ListMembersDto, AddMemberDto, UpdateMemberDto } from '../schemas/member.schema';

/** Controllers de membros da empresa (âmbito sempre `req.tenant`). */
export class MemberController {
  constructor(
    private readonly listMembersUseCase: ListMembersUseCase,
    private readonly addMemberUseCase: AddMemberUseCase,
    private readonly updateMemberUseCase: UpdateMemberUseCase,
    private readonly removeMemberUseCase: RemoveMemberUseCase,
  ) {}

  /** GET /api/v1/company/membros */
  async list(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);

    if (!companyId) {
      return;
    }

    const query = req.query as unknown as ListMembersDto;

    const result = await this.listMembersUseCase.execute({
      companyId,
      page: query.page,
      limit: query.limit,
      status: query.status,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  }

  /** POST /api/v1/company/membros */
  async add(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);
    const actorUserId = req.user?.userId;

    if (!companyId || !actorUserId) {
      if (!companyId) {
        return;
      }

      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as AddMemberDto;

    const member = await this.addMemberUseCase.execute({
      companyId,
      actorUserId,
      userId: body.userId,
      roleId: body.roleId,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(201).json({
      success: true,
      data: member,
    });
  }

  /** PATCH /api/v1/company/membros/:id */
  async update(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);
    const actorUserId = req.user?.userId;

    if (!companyId || !actorUserId) {
      if (!companyId) {
        return;
      }

      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as UpdateMemberDto;

    const member = await this.updateMemberUseCase.execute({
      companyId,
      memberId: Number(req.params.id),
      actorUserId,
      roleId: body.roleId,
      status: body.status,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      success: true,
      data: member,
    });
  }

  /** DELETE /api/v1/company/membros/:id */
  async remove(req: Request, res: Response): Promise<void> {
    const companyId = this.requireCompany(res);
    const actorUserId = req.user?.userId;

    if (!companyId || !actorUserId) {
      if (!companyId) {
        return;
      }

      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const member = await this.removeMemberUseCase.execute({
      companyId,
      memberId: Number(req.params.id),
      actorUserId,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      success: true,
      data: member,
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
