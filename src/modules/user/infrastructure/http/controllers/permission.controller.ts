import { Request, Response } from "express";

import { AssignPermissionUseCase } from "../../../application/use-cases/assign-permission.use-case";
import { RemovePermissionUseCase } from "../../../application/use-cases/remove-permission.use-case";
import { CheckUserPermissionUseCase } from "../../../application/use-cases/check-user-permission.use-case";

export class PermissionController {
    constructor(
        private readonly assignPermissionUseCase: AssignPermissionUseCase,
        private readonly removePermissionUseCase: RemovePermissionUseCase,
        private readonly checkUserPermissionUseCase: CheckUserPermissionUseCase,
    ) { }

    async assign(
        req: Request,
        res: Response,
    ): Promise<Response> {
        const userId = Number(req.params.userId);

        const result =
            await this.assignPermissionUseCase.execute({
                userId,
                permissionId: Number(req.body.permissionId),
            });

        return res.status(200).json(result);
    }

    async remove(
        req: Request,
        res: Response,
    ): Promise<Response> {
        const userId = Number(req.params.userId);

        const result =
            await this.removePermissionUseCase.execute({
                userId,
                permissionId: Number(req.body.permissionId),
            });

        return res.status(200).json(result);
    }

    async check(
        req: Request,
        res: Response,
    ): Promise<Response> {
        const userId = Number(req.params.userId);

        const result =
            await this.checkUserPermissionUseCase.execute({
                userId,
                permissionId: Number(req.params.permissionId),
            });

        return res.status(200).json(result);
    }
}