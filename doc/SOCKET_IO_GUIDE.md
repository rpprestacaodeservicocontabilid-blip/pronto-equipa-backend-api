# Socket.io Real-time Notifications

## Configuração

O sistema está configurado com Socket.io para emitir notificações em tempo real para:
- Novos matches criados
- Matches iniciados
- Atualizações de placar
- Matches finalizados
- Novos torneios
- Inscrições abertas em torneios
- Pagamentos confirmados

## Como Usar (Frontend)

### Instalação

```bash
npm install socket.io-client
```

### Conexão com o servidor

```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:3333', {
  auth: {
    token: 'seu-jwt-token',
    userId: 123,      // ID do usuário autenticado
    cityId: 45        // ID da cidade para receber notificações locais
  }
});

socket.on('connect', () => {
  console.log('Conectado ao servidor');
});

socket.on('disconnect', () => {
  console.log('Desconectado do servidor');
});
```

## Eventos Disponíveis

### Matches (Matches)

#### `match:created`
Emitido quando um novo match é criado.

```typescript
socket.on('match:created', (data) => {
  console.log('Novo match criado:', data);
  // {
  //   type: "MATCH_CREATED",
  //   message: "Novo match: Time A vs Time B",
  //   data: {
  //     id: 1,
  //     homeTeamName: "Time A",
  //     awayTeamName: "Time B",
  //     fieldName: "Campo do João",
  //     scheduledAt: "2024-03-15T14:00:00Z",
  //     status: "SCHEDULED",
  //     autoMatched: true
  //   },
  //   timestamp: "2024-03-10T10:30:00Z"
  // }
});
```

#### `match:started`
Emitido quando um match é iniciado.

```typescript
socket.on('match:started', (data) => {
  console.log('Match iniciado:', data);
  // {
  //   type: "MATCH_STARTED",
  //   message: "Match iniciado: Time A vs Time B",
  //   data: {
  //     id: 1,
  //     homeTeamName: "Time A",
  //     awayTeamName: "Time B",
  //     fieldName: "Campo do João",
  //     scheduledAt: "2024-03-15T14:00:00Z"
  //   },
  //   timestamp: "2024-03-15T14:00:00Z"
  // }
});
```

#### `match:score_updated`
Emitido quando o placar é atualizado.

```typescript
socket.on('match:score_updated', (data) => {
  console.log('Placar atualizado:', data);
  // {
  //   type: "SCORE_UPDATED",
  //   message: "Placar: Time A 2 x 1 Time B",
  //   data: {
  //     id: 1,
  //     homeTeamName: "Time A",
  //     awayTeamName: "Time B",
  //     homeScore: 2,
  //     awayScore: 1,
  //     fieldName: "Campo do João"
  //   },
  //   timestamp: "2024-03-15T14:45:00Z"
  // }
});
```

#### `match:finished`
Emitido quando um match termina.

```typescript
socket.on('match:finished', (data) => {
  console.log('Match finalizado:', data);
  // {
  //   type: "MATCH_FINISHED",
  //   message: "Match finalizado: Time A 2 x 1 Time B",
  //   data: {
  //     id: 1,
  //     homeTeamName: "Time A",
  //     awayTeamName: "Time B",
  //     homeScore: 2,
  //     awayScore: 1,
  //     fieldName: "Campo do João"
  //   },
  //   timestamp: "2024-03-15T15:30:00Z"
  // }
});
```

### Torneios (Tournaments)

#### `tournament:created`
Emitido quando um novo torneio é criado.

```typescript
socket.on('tournament:created', (data) => {
  console.log('Novo torneio criado:', data);
  // {
  //   type: "TOURNAMENT_CREATED",
  //   message: "Novo torneio: Copa da Cidade",
  //   data: {
  //     id: 1,
  //     name: "Copa da Cidade",
  //     status: "DRAFT",
  //     startsAt: "2024-04-01T00:00:00Z",
  //     endsAt: "2024-04-30T23:59:59Z"
  //   },
  //   timestamp: "2024-03-10T10:30:00Z"
  // }
});
```

#### `tournament:opened`
Emitido quando inscrições são abertas para um torneio.

```typescript
socket.on('tournament:opened', (data) => {
  console.log('Inscrições abertas:', data);
  // {
  //   type: "TOURNAMENT_OPENED",
  //   message: "Inscrições abertas: Copa da Cidade",
  //   data: {
  //     id: 1,
  //     name: "Copa da Cidade",
  //     status: "OPEN",
  //     endsAt: "2024-04-01T00:00:00Z"
  //   },
  //   timestamp: "2024-03-15T08:00:00Z"
  // }
});
```

#### `tournament:team_registered`
Emitido quando um novo time se inscreve em um torneio.

```typescript
socket.on('tournament:team_registered', (data) => {
  console.log('Novo time inscrito:', data);
  // {
  //   type: "TEAM_REGISTERED",
  //   message: "Novo time inscrito no torneio Copa da Cidade",
  //   tournamentId: 1,
  //   teamId: 5,
  //   timestamp: "2024-03-18T14:20:00Z"
  // }
});
```

### Pagamentos (Payments)

#### `payment:confirmed`
Emitido quando um pagamento é confirmado.

```typescript
socket.on('payment:confirmed', (data) => {
  console.log('Pagamento confirmado:', data);
  // {
  //   type: "PAYMENT_CONFIRMED",
  //   message: "Pagamento de 5000 KZ confirmado!",
  //   paymentId: 1,
  //   amount: 5000,
  //   currency: "KZ",
  //   timestamp: "2024-03-10T11:00:00Z"
  // }
});
```

## Rooms (Salas)

O servidor organiza os clientes em salas para facilitar a distribuição de notificações:

### Salas por Usuário
```
user:{userId}
```
Exemplo: `user:123`
- Notificações específicas do usuário
- Pagamentos confirmados
- Atualizações de perfil

### Salas por Cidade
```
city:{cityId}
```
Exemplo: `city:45`
- Novos matches
- Novos torneios
- Atualizações gerais da cidade

## Exemplo Completo (React)

```typescript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function MatchNotifications() {
  const [matches, setMatches] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Conectar ao servidor
    const newSocket = io('http://localhost:3333', {
      auth: {
        token: localStorage.getItem('token'),
        userId: 123,
        cityId: 45
      }
    });

    setSocket(newSocket);

    // Ouvir novos matches
    newSocket.on('match:created', (data) => {
      setMatches(prev => [...prev, data.data]);
    });

    // Ouvir atualizações de placar
    newSocket.on('match:score_updated', (data) => {
      setMatches(prev => 
        prev.map(m => m.id === data.data.id ? { ...m, ...data.data } : m)
      );
    });

    // Ouvir matches finalizados
    newSocket.on('match:finished', (data) => {
      setMatches(prev => 
        prev.map(m => 
          m.id === data.data.id 
            ? { ...m, status: 'FINISHED', ...data.data } 
            : m
        )
      );
    });

    // Limpeza ao desmontar
    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <div>
      <h2>Matches Em Tempo Real</h2>
      {matches.map(match => (
        <div key={match.id}>
          <p>{match.homeTeamName} vs {match.awayTeamName}</p>
          <p>Placar: {match.homeScore} x {match.awayScore}</p>
          <p>Status: {match.status}</p>
        </div>
      ))}
    </div>
  );
}
```

## Tratamento de Erros

```typescript
socket.on('error', (error) => {
  console.error('Erro de Socket.io:', error);
});

socket.on('connect_error', (error) => {
  console.error('Erro ao conectar:', error);
  // Reconectar automaticamente após 5 segundos
  setTimeout(() => {
    socket.connect();
  }, 5000);
});
```

## Configurações de Reconexão

O Socket.io está configurado com:
- Reconexão automática
- Timeout padrão de 20 segundos
- Múltiplas tentativas de reconexão

## Boas Práticas

1. **Desconectar ao desmontar**: Sempre desconecte o socket when leaving a page/component
2. **Usar rooms**: Aproveite as rooms para filtrar notificações por usuário/cidade
3. **Tratamento de erros**: Sempre implemente handlers para erros de conexão
4. **Debounce**: Para eventos de alta frequência (score updates), considere debouncing no frontend

## Testing

Para testar Socket.io em desenvolvimento:

```typescript
// No navegador (console)
const socket = io('http://localhost:3333', {
  auth: { userId: 1, cityId: 1 }
});

// Ouvir evento
socket.on('match:created', console.log);

// Enviar evento (se implementado no servidor)
socket.emit('custom:event', { data: 'test' });
```

## Performance

O sistema foi otimizado para:
- Conexões eficientes
- Mensagens pequenas e estruturadas
- Paginação de eventos (se necessário)
- Memory leak prevention com proper cleanup
