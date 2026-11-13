# Regras de roles e cadastro

O sistema reconhece somente estas roles:

| Role | Perfil |
| --- | --- |
| `TEAM_OWNER` | Utilizador final responsável por equipas |
| `FIELD_OWNER` | Utilizador final responsável por campos |
| `ORGANIZER` | Utilizador final responsável por torneios |
| `ADMIN` | Perfil administrativo do negócio |
| `SUPER_ADMIN` | Perfil administrativo da plataforma |

`ADMIN` e `SUPER_ADMIN` têm acesso total, conforme a regra de autorização do sistema. O cadastro público aceita somente `TEAM_OWNER`, `FIELD_OWNER` ou `ORGANIZER`; roles administrativas são atribuídas apenas por fluxo administrativo.

Os endpoints de autorização e permissões devem conceder roles finais por recurso. A existência de uma role válida não concede acesso a todas as operações: apenas `ADMIN` e `SUPER_ADMIN` recebem o bypass global.

## Migração

A migration `20261022000000-remove-obsolete-system-roles` remove definições antigas (`USER`, `PLAYER`, `TEAM_MANAGER`, `MODERATOR`, `PLATFORM_MANAGER`) quando não estão atribuídas. Se encontrar utilizadores com essas roles, interrompe a migration e lista as roles que precisam de ser reatribuídas a uma das cinco roles oficiais. Nenhuma permissão administrativa é promovida automaticamente.
