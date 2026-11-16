import { Request, Response } from 'express';
import { ManageSalaryStructureUseCase } from '../../application/use-cases/manage-salary-structure.use-case';
import { SalaryStructureRepositoryPort } from '../../application/ports/salary-structure.repository.port';

type Context = { companyId: number; actorUserId: number };
type Operation<T> = (repository: SalaryStructureRepositoryPort, context: Context) => Promise<T>;

export class SalaryStructureController {
  constructor(private readonly salaryStructure: ManageSalaryStructureUseCase) {}

  async read<T>(
    req: Request,
    res: Response,
    operation: (repository: SalaryStructureRepositoryPort, companyId: number) => Promise<T>,
  ): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.salaryStructure.query((repository) => operation(repository, companyId));
    res.status(200).json({ success: true, data });
  }

  async write<T>(
    req: Request,
    res: Response,
    action: string,
    entityType: string,
    operation: Operation<T>,
    status = 200,
  ): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.salaryStructure.execute(
      context.companyId,
      context.actorUserId,
      action,
      entityType,
      (repository) => operation(repository, context),
    );
    res.status(status).json({ success: true, data });
  }

  private context(req: Request, res: Response): Context | null {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (companyId === null) return null;
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return null;
    }
    return { companyId, actorUserId };
  }

  private companyId(res: Response): number | null {
    const companyId = res.req.tenant?.companyId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company context is required.' });
      return null;
    }
    return companyId;
  }
}
