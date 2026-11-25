import { Request, Response } from 'express';

import { CreateCompanyUseCase } from '../../application/use-cases/create-company.use-case';
import { ListMyCompaniesUseCase } from '../../application/use-cases/list-my-companies.use-case';
import { ListAllCompaniesUseCase } from '../../application/use-cases/list-all-companies.use-case';
import { GetCompanyContextUseCase } from '../../application/use-cases/get-company-context.use-case';
import { UpdateCompanyUseCase } from '../../application/use-cases/update-company.use-case';
import { ChangeCompanyStatusUseCase } from '../../application/use-cases/change-company-status.use-case';
import { ListMembersUseCase } from '../../application/use-cases/list-members.use-case';
import { ListMembersDto } from '../schemas/member.schema';
import { CreateCompanyDto, UpdateCompanyDto, ListCompaniesDto, platformCompanyParams, companyStatusChangeSchema } from '../schemas/company.schema';

/**
 * Controllers de empresa.
 *
 * `company.*` resolvem o tenant a partir do contexto (`req.tenant`)
 * ou do parâmetro de rota em rotas de plataforma; os dados nunca
 * vêm do body do cliente para definir o âmbito.
 */
export class CompanyController {
  constructor(
    private readonly createCompanyUseCase: CreateCompanyUseCase,
    private readonly listMyCompaniesUseCase: ListMyCompaniesUseCase,
    private readonly listAllCompaniesUseCase: ListAllCompaniesUseCase,
    private readonly getCompanyContextUseCase: GetCompanyContextUseCase,
    private readonly updateCompanyUseCase: UpdateCompanyUseCase,
    private readonly changeCompanyStatusUseCase: ChangeCompanyStatusUseCase,
    private readonly listMembersUseCase: ListMembersUseCase,
  ) {}

  /** POST /api/v1/companies */
  async create(req: Request, res: Response): Promise<void> {
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as CreateCompanyDto;

    // O papel do criador: ADMIN (role global canónica).

    const company = await this.createCompanyUseCase.execute({
      actorUserId,
      name: body.name,
      slug: body.slug ?? null,
      nif: body.nif ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      timezone: body.timezone,
      locale: body.locale,

      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(201).json({
      success: true,
      data: company,
    });
  }

  /** GET /api/v1/companies */
  async listMy(req: Request, res: Response): Promise<void> {
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const result = await this.listMyCompaniesUseCase.execute(actorUserId);

    res.status(200).json({
      success: true,
      data: result.data,
    });
  }

  /** GET /api/v1/platform/companies */
  async listAll(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListCompaniesDto;

    const result = await this.listAllCompaniesUseCase.execute({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  }

  async platformSummary(_req: Request, res: Response): Promise<void> {
    const data = await this.listAllCompaniesUseCase.summary();
    res.json({ success: true, data });
  }

  async platformDetails(req: Request, res: Response): Promise<void> {
    const { id } = platformCompanyParams.parse(req.params);
    const data = await this.listAllCompaniesUseCase.get(id);
    res.json({ success: true, data });
  }

  async platformMembers(req: Request, res: Response): Promise<void> {
    const { id } = platformCompanyParams.parse(req.params);
    const query = req.query as unknown as ListMembersDto;
    await this.listAllCompaniesUseCase.get(id);
    const result = await this.listMembersUseCase.execute({ companyId: id, ...query });
    res.json({ success: true, ...result });
  }

  /** GET /api/v1/company/context */
  async context(req: Request, res: Response): Promise<void> {
    const companyId = req.tenant?.companyId;
    const userId = req.user?.userId;

    if (!companyId || !userId) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Company context is required.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const result = await this.getCompanyContextUseCase.execute({
      companyId,
      userId,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  /** PATCH /api/v1/company */
  async update(req: Request, res: Response): Promise<void> {
    await this.updateProfile(req, res, req.tenant?.companyId);
  }

  async platformUpdate(req: Request, res: Response): Promise<void> {
    const { id } = platformCompanyParams.parse(req.params);
    await this.updateProfile(req, res, id);
  }

  private async updateProfile(req: Request, res: Response, companyId?: number): Promise<void> {
    const actorUserId = req.user?.userId;

    if (!companyId || !actorUserId) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Company context is required.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const body = req.body as UpdateCompanyDto;

    const company = await this.updateCompanyUseCase.execute({
      companyId,
      actorUserId,
      name: body.name,
      nif: body.nif,
      email: body.email,
      phone: body.phone,
      timezone: body.timezone,
      locale: body.locale,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      success: true,
      data: company,
    });
  }

  /** PATCH /api/v1/platform/companies/:id/suspend */
  async suspend(req: Request, res: Response): Promise<void> {
    await this.changeStatus(req, res, 'company.suspended');
  }

  /** PATCH /api/v1/platform/companies/:id/activate */
  async activate(req: Request, res: Response): Promise<void> {
    await this.changeStatus(req, res, 'company.activated');
  }

  private async changeStatus(
    req: Request,
    res: Response,
    action: 'company.suspended' | 'company.activated',
  ): Promise<void> {
    const actorUserId = req.user?.userId;
    const { id: companyId } = platformCompanyParams.parse(req.params);
    const { reason } = companyStatusChangeSchema.parse(req.body);

    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const company = await this.changeCompanyStatusUseCase.execute({
      companyId,
      actorUserId,
      action,
      reason,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.status(200).json({
      success: true,
      data: company,
    });
  }
}
