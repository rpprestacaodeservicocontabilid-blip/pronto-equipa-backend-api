import {
    Request,
    Response,
    NextFunction,
} from "express";

import { UserRepository } from "../../../domain/repositories/user.repository";

export const userStatusMiddleware = (
    userRepository: UserRepository,
) => {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            const userId =
                req.userContext?.userId;

            if (!userId) {
                res.status(401).json({
                    message: "Contexto do utilizador não encontrado.",
                });

                return;
            }

            const user =
                await userRepository.findById(userId);

            if (!user) {
                res.status(404).json({
                    message: "Utilizador não encontrado.",
                });

                return;
            }

            if (!user.isActive()) {
                res.status(403).json({
                    message: "Utilizador inativo.",
                });

                return;
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};