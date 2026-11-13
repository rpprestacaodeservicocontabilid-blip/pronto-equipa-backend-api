# CI/CD da API

O pipeline fica em [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml) e publica as imagens no GitHub Container Registry (GHCR).

## Caminho de uma alteração

1. Abra um pull request para `dev` ou `main`. O CI instala as dependências com `npm ci` e exige type-check, lint, testes e build TypeScript. Também constrói a imagem Docker para detectar falhas no container. Pull requests não publicam imagens.
2. Ao integrar em `dev`, o pipeline publica `ghcr.io/<owner>/<repo>:dev` e uma tag com o SHA do commit (`dev-<sha>`). Use essa imagem no ambiente de integração.
3. Promova a versão validada de `dev` para `main`. O pipeline publica `main` e `main-<sha>`. Se `main` for a branch padrão do GitHub, também publica `latest`.
4. Para uma release, crie uma tag `vX.Y.Z` apontando para o commit aprovado de `main` e envie a tag. O pipeline publica a versão e a referência do commit no GHCR.

Exemplo de release:

```sh
git switch main
git pull --ff-only
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

## Configuração no GitHub

- Em **Settings → Actions → General**, permita que o `GITHUB_TOKEN` escreva pacotes. O workflow limita essa permissão ao job de imagem.
- Em **Settings → Packages**, confirme que o ambiente que fará o pull consegue acessar o pacote GHCR.
- Proteja `dev` e `main`: exija pull request, revisão e o job `Validate (Node 22)` concluído. Bloqueie force-push e exclusão dessas branches.
- Proteja tags de release `v*` para que apenas responsáveis pela release possam criá-las.

## Deploy

O repositório não identifica um provedor, host ou mecanismo de implantação e `docker-compose.prod.yml` está vazio. Portanto, deploy automático ainda não está habilitado. No servidor/plataforma escolhido, implante a imagem pela tag de SHA, que é imutável, e não por `latest`. Configure o deploy como um GitHub Environment protegido, mantenha credenciais em secrets e execute migrações como etapa explícita antes de direcionar tráfego à nova versão. Depois de definir o destino, o passo de deploy pode consumir a imagem publicada sem alterar a etapa de CI.

## Reprodução local

```sh
npm ci
npm run type-check
npm run lint
npm test -- --runInBand
npm run build
docker build -t peladeiro-api:local .
```

Não versione `.env`, senhas ou chaves. Use GitHub Secrets/Environments na automação e um arquivo de ambiente gerenciado pelo host de deploy.
