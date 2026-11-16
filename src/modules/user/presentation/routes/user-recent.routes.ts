import { Router } from 'express';
import { z } from 'zod';
import { UserType } from '../../domain/enums/user-type.enum';
import { ListRecentUsersUseCase } from '../../application/use-cases/list-recent-users.use-case';
export function createUserRecentRoutes(service: ListRecentUsersUseCase): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    try {
      const rawLimit = Number(req.query.limit),
        limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
      let type: UserType | undefined;
      if (req.query.type !== undefined) {
        const parsed = z.nativeEnum(UserType).safeParse(req.query.type);
        if (!parsed.success) return res.status(400).json({ message: 'Invalid user type.' });
        type = parsed.data;
      }
      return res.json(await service.execute({ limit, type }));
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro interno ao listar usuários recentes',
      });
    }
  });
  return router;
}
