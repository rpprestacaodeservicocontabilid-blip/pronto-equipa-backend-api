/**
 * Exemplos de integração de Socket.io com React
 * Use esses exemplos como referência para implementar notificações em tempo real no frontend
 */

// 1. Hook customizado para Socket.io (useSocket.ts)
import { useEffect, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

interface UseSocketOptions {
  userId: number;
  cityId: number;
  token: string;
}

export function useSocket({ userId, cityId, token }: UseSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3333', {
      auth: {
        token,
        userId,
        cityId
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket.io] Conectado ao servidor');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket.io] Desconectado do servidor');
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket.io] Erro de conexão:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [userId, cityId, token]);

  return { socket, isConnected };
}

// 2. Provider para contexto de Socket.io (SocketProvider.tsx)
import React, { createContext, useContext } from 'react';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children, userId, cityId, token }: any) {
  const { socket, isConnected } = useSocket({ userId, cityId, token });

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext deve ser usado dentro de SocketProvider');
  }
  return context;
}

// 3. Hook para ouvir eventos específicos (useSocketListener.ts)
import { useEffect } from 'react';

export function useSocketListener<T = any>(
  eventName: string,
  callback: (data: T) => void,
  socket?: Socket | null
) {
  useEffect(() => {
    if (!socket) return;

    socket.on(eventName, callback);

    return () => {
      socket.off(eventName, callback);
    };
  }, [socket, eventName, callback]);
}

// 4. Componente de Matches em Tempo Real (LiveMatches.tsx)
import { useState } from 'react';

interface Match {
  id: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore?: number;
  awayScore?: number;
  fieldName: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED';
  scheduledAt: string;
}

export function LiveMatches() {
  const { socket } = useSocketContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);

  // Ouvir novo match criado
  useSocketListener('match:created', (data) => {
    setMatches(prev => [...prev, data.data]);
    setNotifications(prev => [...prev, data.message]);
  }, socket);

  // Ouvir match iniciado
  useSocketListener('match:started', (data) => {
    setMatches(prev =>
      prev.map(m => 
        m.id === data.data.id 
          ? { ...m, status: 'IN_PROGRESS' }
          : m
      )
    );
  }, socket);

  // Ouvir atualização de placar
  useSocketListener('match:score_updated', (data) => {
    setMatches(prev =>
      prev.map(m =>
        m.id === data.data.id
          ? {
              ...m,
              homeScore: data.data.homeScore,
              awayScore: data.data.awayScore
            }
          : m
      )
    );
  }, socket);

  // Ouvir match finalizado
  useSocketListener('match:finished', (data) => {
    setMatches(prev =>
      prev.map(m =>
        m.id === data.data.id
          ? {
              ...m,
              status: 'FINISHED',
              homeScore: data.data.homeScore,
              awayScore: data.data.awayScore
            }
          : m
      )
    );
  }, socket);

  return (
    <div className="live-matches">
      <h2>Matches em Tempo Real</h2>
      
      {/* Notificações */}
      <div className="notifications">
        {notifications.map((notif, idx) => (
          <div key={idx} className="notification">
            🔔 {notif}
          </div>
        ))}
      </div>

      {/* Lista de Matches */}
      <div className="matches-list">
        {matches.map(match => (
          <div key={match.id} className={`match ${match.status.toLowerCase()}`}>
            <div className="match-header">
              <span className="teams">
                {match.homeTeamName} vs {match.awayTeamName}
              </span>
              <span className={`status ${match.status.toLowerCase()}`}>
                {match.status}
              </span>
            </div>

            <div className="match-details">
              <p className="field">📍 {match.fieldName}</p>
              <p className="time">🕐 {new Date(match.scheduledAt).toLocaleString()}</p>
            </div>

            {match.homeScore !== undefined && (
              <div className="score">
                <span className={match.homeScore > match.awayScore! ? 'winner' : ''}>
                  {match.homeScore}
                </span>
                <span className="vs">x</span>
                <span className={match.awayScore! > match.homeScore ? 'winner' : ''}>
                  {match.awayScore}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {matches.length === 0 && (
        <p className="empty-state">Nenhum match disponível no momento</p>
      )}
    </div>
  );
}

// 5. Componente de Notificações Toast (Toast.tsx)
interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

export function ToastNotifications() {
  const { socket } = useSocketContext();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Ouvir pagamento confirmado
  useSocketListener('payment:confirmed', (data) => {
    addToast(data.message, 'success');
  }, socket);

  // Ouvir novo torneio
  useSocketListener('tournament:created', (data) => {
    addToast(data.message, 'info');
  }, socket);

  // Ouvir inscrições abertas
  useSocketListener('tournament:opened', (data) => {
    addToast(data.message, 'info');
  }, socket);

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// 6. Componente de Dashboard com múltiplas seções (Dashboard.tsx)
export function Dashboard() {
  return (
    <SocketProvider userId={123} cityId={45} token={localStorage.getItem('token')!}>
      <div className="dashboard">
        <h1>Dashboard</h1>
        
        <div className="sections">
          <section className="matches-section">
            <LiveMatches />
          </section>

          <section className="tournaments-section">
            <TournamentsNotifications />
          </section>

          <section className="payments-section">
            <PaymentsNotifications />
          </section>
        </div>

        <ToastNotifications />
      </div>
    </SocketProvider>
  );
}

// 7. Componente de Torneios (TournamentsNotifications.tsx)
export function TournamentsNotifications() {
  const { socket } = useSocketContext();
  const [tournaments, setTournaments] = useState<any[]>([]);

  useSocketListener('tournament:created', (data) => {
    setTournaments(prev => [...prev, data.data]);
  }, socket);

  useSocketListener('tournament:opened', (data) => {
    setTournaments(prev =>
      prev.map(t => t.id === data.data.id ? { ...t, ...data.data } : t)
    );
  }, socket);

  useSocketListener('tournament:team_registered', (data) => {
    // Atualizar contagem de times inscritos
    setTournaments(prev =>
      prev.map(t =>
        t.id === data.tournamentId
          ? { ...t, teamsCount: (t.teamsCount || 0) + 1 }
          : t
      )
    );
  }, socket);

  return (
    <div className="tournaments">
      <h2>Torneios</h2>
      <div className="tournaments-list">
        {tournaments.map(tournament => (
          <div key={tournament.id} className="tournament-card">
            <h3>{tournament.name}</h3>
            <p>Status: {tournament.status}</p>
            <p>Times inscritos: {tournament.teamsCount || 0}</p>
            <p>Início: {new Date(tournament.startsAt).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// 8. Componente de Pagamentos (PaymentsNotifications.tsx)
export function PaymentsNotifications() {
  const { socket } = useSocketContext();
  const [payments, setPayments] = useState<any[]>([]);

  useSocketListener('payment:confirmed', (data) => {
    setPayments(prev => [...prev, {
      id: data.paymentId,
      amount: data.amount,
      currency: data.currency,
      confirmedAt: data.timestamp,
      status: 'CONFIRMED'
    }]);
  }, socket);

  return (
    <div className="payments">
      <h2>Pagamentos</h2>
      <div className="payments-list">
        {payments.map(payment => (
          <div key={payment.id} className="payment-item">
            <div className="payment-amount">
              ✓ {payment.amount} {payment.currency}
            </div>
            <div className="payment-date">
              {new Date(payment.confirmedAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 9. Estilos CSS para Notificações (notifications.css)
const notificationStyles = `
.notification {
  background-color: #e8f5e9;
  border-left: 4px solid #4caf50;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 4px;
  animation: slideIn 0.3s ease-in-out;
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.match {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.3s ease;
}

.match.in_progress {
  background-color: #fff3e0;
  border-color: #ff9800;
}

.match.finished {
  background-color: #f3e5f5;
  border-color: #9c27b0;
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.teams {
  font-weight: 600;
  font-size: 16px;
}

.status {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status.scheduled {
  background-color: #e3f2fd;
  color: #1976d2;
}

.status.in_progress {
  background-color: #fff3e0;
  color: #f57c00;
}

.status.finished {
  background-color: #f3e5f5;
  color: #7b1fa2;
}

.score {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 12px;
  font-size: 28px;
  font-weight: bold;
}

.score .vs {
  margin: 0 12px;
  font-size: 16px;
}

.score .winner {
  color: #4caf50;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
}

.toast {
  background-color: white;
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  animation: slideDown 0.3s ease-in-out;
}

.toast.success {
  border-left: 4px solid #4caf50;
  color: #2e7d32;
}

.toast.error {
  border-left: 4px solid #f44336;
  color: #c62828;
}

.toast.warning {
  border-left: 4px solid #ff9800;
  color: #e65100;
}

.toast.info {
  border-left: 4px solid #2196f3;
  color: #1565c0;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
`;

export default notificationStyles;
