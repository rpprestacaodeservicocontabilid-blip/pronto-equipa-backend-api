declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        accountId: number;
        sessionId: number;
        roles: string[];
        permissions: string[];
      };
    }
  }
}

export {};