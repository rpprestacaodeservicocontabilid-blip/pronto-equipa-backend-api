# Modalidades desportivas

O módulo `sport` gere categorias, modalidades e formatos. A migration `20261023000000-create-sport-modalities.js` cria as tabelas; a migration `20261024000000-seed-priority-sport-modalities.js` insere ou atualiza o catálogo inicial de Futebol, Futsal, Basquetebol, Voleibol, Andebol, Ténis, Pádel e Badminton, com os respetivos formatos. Modalidades de versões anteriores ficam inativas para preservar os registos associados.

## Relações

- `sport_modalities.createdBy` aponta para o utilizador que cadastrou a modalidade (`users`).
- `team_modalities` representa a relação muitos-para-muitos entre modalidades e equipes.
- `field_modalities` representa a relação muitos-para-muitos entre modalidades e campos.
- `tournaments.modalityId` aponta para a modalidade principal do torneio. O campo é opcional para manter os torneios já existentes.
- `sport_modality_formats` guarda variações configuráveis, com jogadores por equipa e limites mínimos/máximos.

## API

- `GET /sport/categories`
- `GET /sport/modalities?categoryId=1&featured=true`
- `GET /sport/modalities/admin/all` (ADMIN/SUPER_ADMIN, inclui inativas)
- `GET /sport/modalities/featured`
- `GET /sport/modalities/:id` e `GET /sport/modalities/slug/:slug`
- `GET /sport/modalities/:id/formats`
- `POST /sport/modalities`, `PATCH /sport/modalities/:id`, `PATCH /sport/modalities/:id/status`
- `POST /sport/categories`, `POST /sport/modalities/:id/formats`
- `POST|DELETE /sport/modalities/:id/teams/:relatedId`
- `POST|DELETE /sport/modalities/:id/fields/:relatedId`

Leitura é pública e retorna apenas modalidades ativas. Operações de gestão e associação exigem sessão com role `ADMIN` ou `SUPER_ADMIN`.

## Regras

- O nome e o slug são obrigatórios; slug é único e normalizado para minúsculas.
- A ordem de apresentação é um inteiro não negativo.
- Uma modalidade só pode usar uma categoria ativa.
- Formatos pertencem a uma modalidade e os limites de participantes devem ser positivos; mínimo não pode exceder máximo.
- A desativação oculta a modalidade das listagens públicas sem apagar associações ou histórico.
- A modalidade do torneio é opcional na criação atual e validada pela chave estrangeira quando fornecida.
