import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from '../config/logger';
import { ENV } from '../config/env';
import { JwtTokenService } from '../modules/auth/infrastructure/service/jwt-token.service';

/** Teto anti-flood de conexões simultâneas por IP. */
const MAX_CONNECTIONS_PER_IP = Number(
  process.env.SOCKET_MAX_CONN_PER_IP || 30,
);

let io: Server | null = null;
const connectionsPerIp = new Map<string, number>();

function tokenService(): JwtTokenService {
  return new JwtTokenService(
    ENV.JWT.SECRET,
    ENV.JWT.EXPIRES_IN || '15m',
  );
}

export class NotificationService {
  /**
   * Inicializa o Socket.io com autenticação JWT obrigatória.
   */
  static initializeSocket(httpServer: HTTPServer): Server {
    io = new Server(httpServer, {
      cors: {
        origin:
          ENV.NODE_ENV === 'production'
            ? ENV.APP.FRONTEND_URL
            : true,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      // Evita conexões zombie a acumular.
      pingTimeout: 20000,
      pingInterval: 25000,
    });

    // Autenticação: exige access token válido.
    io.use(async (socket, next) => {
      try {
        const token: string | undefined =
          socket.handshake.auth?.token;

        if (!token) {
          logger.warn(
            '[Socket.io] Conexão recusada: sem token',
          );
          return next(
            new Error('Authentication required'),
          );
        }

        const payload = await tokenService()
          .verifyAccessToken(token);

        socket.data.user = {
          userId: payload.userId,
          sessionId: payload.sessionId,
          roles: payload.roles,
        };

        next();
      } catch {
        logger.warn(
          '[Socket.io] Conexão recusada: token inválido',
        );
        next(new Error('Invalid or expired token'));
      }
    });

    io.on('connection', (socket: Socket) => {
      const ip =
        socket.handshake.address || 'unknown';
      const current = connectionsPerIp.get(ip) ?? 0;

      if (current >= MAX_CONNECTIONS_PER_IP) {
        logger.warn(
          `[Socket.io] IP ${ip} excedeu o limite de conexões`,
        );
        socket.disconnect(true);
        return;
      }

      connectionsPerIp.set(ip, current + 1);

      const userId: number | undefined =
        socket.data.user?.userId;
      const cityId: unknown =
        socket.handshake.auth?.cityId;

      logger.info(
        `[Socket.io] Novo cliente conectado: ${socket.id} (User: ${userId})`,
      );

      if (userId) {
        socket.join(`user:${userId}`);
      }
      if (
        typeof cityId === 'number' ||
        typeof cityId === 'string'
      ) {
        socket.join(`city:${cityId}`);
      }

      const release = () => {
        const left = (connectionsPerIp.get(ip) ?? 1) - 1;

        if (left <= 0) {
          connectionsPerIp.delete(ip);
        } else {
          connectionsPerIp.set(ip, left);
        }
      };

      socket.on('disconnect', () => {
        release();
        logger.info(
          `[Socket.io] Cliente desconectado: ${socket.id}`,
        );
      });

      socket.on('error', (error) => {
        logger.error(
          `[Socket.io] Erro do cliente ${socket.id}:`,
          error,
        );
      });
    });

    logger.info('[Socket.io] Inicializado com sucesso');
    return io;
  }

  /**
   * Emite notificação para um usuário específico
   */
  static notifyUser(userId: number, event: string, data: any): void {
    if (!io) {
      logger.warn('[Socket.io] Socket.io não inicializado');
      return;
    }

    io.to(`user:${userId}`).emit(event, data);
    logger.debug(`[Socket.io] Notificação enviada para user:${userId} - ${event}`);
  }

  /**
   * Emite notificação para vários usuários específicos
   * (ex.: participantes de um chat de partida).
   */
  static notifyUsers(userIds: number[], event: string, data: any): void {
    if (!io) {
      logger.warn('[Socket.io] Socket.io não inicializado');
      return;
    }

    for (const userId of new Set(userIds)) {
      io.to(`user:${userId}`).emit(event, data);
    }

    logger.debug(
      `[Socket.io] Notificação enviada para ${userIds.length} user(s) - ${event}`,
    );
  }

  /**
   * Emite notificação para todos na cidade
   */
  static notifyCity(cityId: number, event: string, data: any): void {
    if (!io) {
      logger.warn('[Socket.io] Socket.io não inicializado');
      return;
    }

    io.to(`city:${cityId}`).emit(event, data);
    logger.debug(`[Socket.io] Notificação enviada para city:${cityId} - ${event}`);
  }

  /**
   * Emite notificação para todos os clients
   */
  static broadcastAll(event: string, data: any): void {
    if (!io) {
      logger.warn('[Socket.io] Socket.io não inicializado');
      return;
    }

    io.emit(event, data);
    logger.debug(`[Socket.io] Notificação broadcast - ${event}`);
  }

  /**
   * Notifica quando um novo match é criado
   */
  static notifyNewMatch(cityId: number, matchData: any): void {
    this.notifyCity(cityId, 'match:created', {
      type: 'MATCH_CREATED',
      message: `Novo match: ${matchData.homeTeamName} vs ${matchData.awayTeamName}`,
      data: matchData,
      timestamp: new Date(),
    });
  }

  /**
   * Notifica quando um match é iniciado
   */
  static notifyMatchStarted(cityId: number, matchData: any): void {
    this.notifyCity(cityId, 'match:started', {
      type: 'MATCH_STARTED',
      message: `Match iniciado: ${matchData.homeTeamName} vs ${matchData.awayTeamName}`,
      data: matchData,
      timestamp: new Date(),
    });
  }

  /**
   * Notifica quando placar é atualizado
   */
  static notifyScoreUpdate(cityId: number, matchData: any): void {
    this.notifyCity(cityId, 'match:score_updated', {
      type: 'SCORE_UPDATED',
      message: `Placar: ${matchData.homeTeamName} ${matchData.homeScore} x ${matchData.awayScore} ${matchData.awayTeamName}`,
      data: matchData,
      timestamp: new Date(),
    });
  }

  /**
   * Notifica quando um match termina
   */
  static notifyMatchFinished(cityId: number, matchData: any): void {
    this.notifyCity(cityId, 'match:finished', {
      type: 'MATCH_FINISHED',
      message: `Match finalizado: ${matchData.homeTeamName} ${matchData.homeScore} x ${matchData.awayScore} ${matchData.awayTeamName}`,
      data: matchData,
      timestamp: new Date(),
    });
  }

  /**
   * Notifica quando um novo torneio é criado
   */
  static notifyNewTournament(cityId: number, tournamentData: any): void {
    this.notifyCity(cityId, 'tournament:created', {
      type: 'TOURNAMENT_CREATED',
      message: `Novo torneio: ${tournamentData.name}`,
      data: tournamentData,
      timestamp: new Date(),
    });
  }

  /**
   * Notifica quando um torneio começa inscrições
   */
  static notifyTournamentOpen(cityId: number, tournamentData: any): void {
    this.notifyCity(cityId, 'tournament:opened', {
      type: 'TOURNAMENT_OPENED',
      message: `Inscrições abertas: ${tournamentData.name}`,
      data: tournamentData,
      timestamp: new Date(),
    });
  }

  /**
   * Notifica quando um pagamento é confirmado
   */
  static notifyPaymentConfirmed(userId: number, paymentData: any): void {
    this.notifyUser(userId, 'payment:confirmed', {
      type: 'PAYMENT_CONFIRMED',
      message: `Pagamento confirmado: ${paymentData.amount} ${paymentData.currency}`,
      data: paymentData,
      timestamp: new Date(),
    });
  }

  /**
   * Retorna a instância do Socket.io
   */
  static getIO(): Server | null {
    return io;
  }
}

export default NotificationService;
