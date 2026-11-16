import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { Socket as ClientSocket, io as ioClient } from 'socket.io-client';
import NotificationService from '../../sockets/socket.server';
import { JwtTokenService } from '../../modules/auth/infrastructure/service/jwt-token.service';
import { ENV } from '../../config/env';

describe('Socket.io Notifications', () => {
  let httpServer: any;
  let ioServer: Server;
  let clientSocket: ClientSocket;
  let authToken: string;
  let authTokenUser2: string;
  const PORT = 3001;

  async function mintToken(userId = 1): Promise<string> {
    const service = new JwtTokenService(ENV.JWT.SECRET || 'secret', '15m');

    const result = await service.generateAccessToken({
      userId,
      sessionId: 1,
      roles: [],
      permissions: [],
    });

    return result.token;
  }

  beforeEach(async () => {
    // Criar servidor HTTP
    httpServer = createServer();

    // Inicializar Socket.io
    ioServer = NotificationService.initializeSocket(httpServer);

    // Token válido para o handshake autenticado
    authToken = await mintToken(1);
    authTokenUser2 = await mintToken(2);

    // Iniciar o servidor na porta de teste
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, () => {
        resolve();
      });
    });

    // Criar cliente de teste (websocket: evita pedidos XHR de
    // polling que ficam pendentes e impedem o Jest de sair).
    clientSocket = ioClient(`http://localhost:${PORT}`, {
      auth: {
        token: authToken,
        userId: 1,
        cityId: 1,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 10,
      reconnectionDelayMax: 100,
      reconnectionAttempts: 3,
    });
  });

  afterEach(async () => {
    // Desconectar SEMPRE (mesmo ainda a reconectar): para os
    // timers de reconnection.
    clientSocket.disconnect();

    // Fechar servidor e aguardar a confirmação.
    await new Promise<void>((resolve) => {
      ioServer.close(() => resolve());
      setTimeout(resolve, 500);
    });

    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        setTimeout(resolve, 500);
      });
    }

    // Aguardar limpeza
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 100);
    });
  });

  describe('Connection', () => {
    it('deve conectar ao servidor', (done) => {
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('deve entrar nas rooms corretas', (done) => {
      clientSocket.on('connect', () => {
        // Rooms são verificadas no servidor (o cliente não expõe rooms).
        setTimeout(() => {
          const { rooms } = ioServer.sockets.adapter as unknown as {
            rooms: Map<string, Set<string>>;
          };

          expect(rooms.has('user:1')).toBe(true);
          expect(rooms.has('city:1')).toBe(true);
          done();
        }, 100);
      });
    });

    it('deve reconectar após desconexão', (done) => {
      let disconnectCount = 0;
      let connectCount = 0;

      clientSocket.on('disconnect', () => {
        disconnectCount++;
      });

      clientSocket.on('connect', () => {
        connectCount++;
        if (connectCount === 2) {
          expect(disconnectCount).toBe(1);
          done();
        }
      });

      // Aguardar primeira conexão
      clientSocket.on('connect', () => {
        if (connectCount === 1) {
          // Desconectar e deixar reconectar
          clientSocket.disconnect();
          setTimeout(() => {
            clientSocket.connect();
          }, 50);
        }
      });
    });
  });

  describe('New Match Notification', () => {
    it('deve receber notificação de novo match', (done) => {
      const matchData = {
        id: 1,
        homeTeamName: 'Time A',
        awayTeamName: 'Time B',
        fieldName: 'Campo 1',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
        autoMatched: false,
      };

      clientSocket.on('match:created', (data: any) => {
        expect(data.type).toBe('MATCH_CREATED');
        expect({
          ...data.data,
          scheduledAt: new Date(data.data.scheduledAt),
        }).toEqual(matchData);
        expect(data.message).toContain('Time A');
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyNewMatch(1, matchData);
      });
    });

    it('deve incluir mensagem personalizada', (done) => {
      const matchData = {
        id: 2,
        homeTeamName: 'Flamengo',
        awayTeamName: 'Vasco',
        fieldName: 'Estádio',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
      };

      clientSocket.on('match:created', (data: any) => {
        expect(data.message).toBe('Novo match: Flamengo vs Vasco');
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyNewMatch(1, matchData);
      });
    });
  });

  describe('Match Started Notification', () => {
    it('deve receber notificação de match iniciado', (done) => {
      const matchData = {
        id: 1,
        homeTeamName: 'Time A',
        awayTeamName: 'Time B',
        fieldName: 'Campo 1',
        scheduledAt: new Date(),
      };

      clientSocket.on('match:started', (data: any) => {
        expect(data.type).toBe('MATCH_STARTED');
        expect({
          ...data.data,
          scheduledAt: new Date(data.data.scheduledAt),
        }).toEqual(matchData);
        expect(data.message).toContain('iniciado');
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyMatchStarted(1, matchData);
      });
    });
  });

  describe('Score Update Notification', () => {
    it('deve receber notificação de atualização de placar', (done) => {
      const matchData = {
        id: 1,
        homeTeamName: 'Time A',
        awayTeamName: 'Time B',
        homeScore: 2,
        awayScore: 1,
        fieldName: 'Campo 1',
      };

      clientSocket.on('match:score_updated', (data: any) => {
        expect(data.type).toBe('SCORE_UPDATED');
        expect(data.message).toBe('Placar: Time A 2 x 1 Time B');
        expect(data.data.homeScore).toBe(2);
        expect(data.data.awayScore).toBe(1);
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyScoreUpdate(1, matchData);
      });
    });
  });

  describe('Match Finished Notification', () => {
    it('deve receber notificação de match finalizado', (done) => {
      const matchData = {
        id: 1,
        homeTeamName: 'Time A',
        awayTeamName: 'Time B',
        homeScore: 3,
        awayScore: 1,
        fieldName: 'Campo 1',
      };

      clientSocket.on('match:finished', (data: any) => {
        expect(data.type).toBe('MATCH_FINISHED');
        expect(data.message).toContain('finalizado');
        expect(data.message).toContain('3');
        expect(data.message).toContain('1');
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyMatchFinished(1, matchData);
      });
    });
  });

  describe('Tournament Notifications', () => {
    it('deve receber notificação de novo torneio', (done) => {
      const tournamentData = {
        id: 1,
        name: 'Copa da Cidade',
        status: 'DRAFT',
        startsAt: new Date('2024-04-01'),
        endsAt: new Date('2024-04-30'),
      };

      clientSocket.on('tournament:created', (data: any) => {
        expect(data.type).toBe('TOURNAMENT_CREATED');
        expect(data.message).toBe('Novo torneio: Copa da Cidade');
        expect(data.data.name).toBe('Copa da Cidade');
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyNewTournament(1, tournamentData);
      });
    });

    it('deve receber notificação de inscrições abertas', (done) => {
      const tournamentData = {
        id: 1,
        name: 'Copa da Cidade',
        status: 'OPEN',
        endsAt: new Date('2024-04-01'),
      };

      clientSocket.on('tournament:opened', (data: any) => {
        expect(data.type).toBe('TOURNAMENT_OPENED');
        expect(data.message).toContain('Inscrições abertas');
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyTournamentOpen(1, tournamentData);
      });
    });
  });

  describe('Payment Notifications', () => {
    it('deve notificar usuário sobre pagamento confirmado', (done) => {
      const paymentData = {
        amount: 5000,
        currency: 'KZ',
      };

      clientSocket.on('payment:confirmed', (data: any) => {
        expect(data.type).toBe('PAYMENT_CONFIRMED');
        expect(data.message).toContain('5000');
        expect(data.message).toContain('KZ');
        done();
      });

      clientSocket.on('connect', () => {
        NotificationService.notifyPaymentConfirmed(1, paymentData);
      });
    });
  });

  describe('Room Management', () => {
    it('deve separar notificações por cidade', (done) => {
      const otherSocket = ioClient(`http://localhost:${PORT}`, {
        auth: {
          token: authTokenUser2,
          userId: 2,
          cityId: 99, // Cidade diferente
        },
        transports: ['websocket'],
      });

      const matchData = {
        id: 1,
        homeTeamName: 'Time A',
        awayTeamName: 'Time B',
        fieldName: 'Campo 1',
        scheduledAt: new Date(),
        status: 'SCHEDULED',
      };

      let mainSocketReceived = false;
      let otherSocketReceived = false;

      clientSocket.on('match:created', () => {
        mainSocketReceived = true;
        checkDone();
      });

      otherSocket.on('match:created', () => {
        otherSocketReceived = true;
      });

      function checkDone() {
        if (mainSocketReceived && !otherSocketReceived) {
          setTimeout(() => {
            expect(mainSocketReceived).toBe(true);
            expect(otherSocketReceived).toBe(false);
            otherSocket.disconnect();
            done();
          }, 200);
        }
      }

      otherSocket.on('connect', () => {
        // Esperar os dois sockets conectarem
        setTimeout(() => {
          NotificationService.notifyNewMatch(1, matchData);
          setTimeout(checkDone, 100);
        }, 100);
      });
    });

    it('deve enviar notificações broadcast para todos', (done) => {
      const socket1 = clientSocket;

      const socket2 = ioClient(`http://localhost:${PORT}`, {
        auth: {
          token: authTokenUser2,
          userId: 2,
          cityId: 50,
        },
        transports: ['websocket'],
      });

      let socket1Received = false;
      let socket2Received = false;

      socket1.on('test:broadcast', () => {
        socket1Received = true;
        checkBoth();
      });

      socket2.on('test:broadcast', () => {
        socket2Received = true;
        checkBoth();
      });

      function checkBoth() {
        if (socket1Received && socket2Received) {
          socket2.disconnect();
          done();
        }
      }

      socket2.on('connect', () => {
        setTimeout(() => {
          NotificationService.broadcastAll('test:broadcast', {
            message: 'Teste',
          });
        }, 100);
      });
    });
  });

  describe('Notification Batching', () => {
    it('deve receber múltiplas notificações em sequência', (done) => {
      const notifications: any[] = [];

      clientSocket.on('match:created', (data: any) => {
        notifications.push(data);
        if (notifications.length === 3) {
          expect(notifications.length).toBe(3);
          expect(notifications[0].data.id).toBe(1);
          expect(notifications[1].data.id).toBe(2);
          expect(notifications[2].data.id).toBe(3);
          done();
        }
      });

      clientSocket.on('connect', () => {
        [1, 2, 3].forEach((id) => {
          NotificationService.notifyNewMatch(1, {
            id,
            homeTeamName: `Time ${id}A`,
            awayTeamName: `Time ${id}B`,
            fieldName: 'Campo 1',
            scheduledAt: new Date(),
            status: 'SCHEDULED',
          });
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('deve manter conexão mesmo com notificações vazias', (done) => {
      let errorOccurred = false;

      clientSocket.on('connect_error', () => {
        errorOccurred = true;
      });

      clientSocket.on('connect', () => {
        // Enviar notificação sem dados
        try {
          NotificationService.notifyNewMatch(1, {
            id: 1,
            homeTeamName: '',
            awayTeamName: '',
            fieldName: '',
            scheduledAt: new Date(),
            status: 'SCHEDULED',
          });

          setTimeout(() => {
            expect(errorOccurred).toBe(false);
            done();
          }, 100);
        } catch (error) {
          expect(error).toBeUndefined();
        }
      });
    });
  });
});
