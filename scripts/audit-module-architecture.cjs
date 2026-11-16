const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modulesRoot = path.join(root, 'src/modules');
const slash = (file) => file.replace(/\\/g, '/');
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );
const modules = fs
  .readdirSync(modulesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const violations = [];
const inventory = [];
for (const name of modules) {
  const moduleDir = path.join(modulesRoot, name);
  const files = walk(moduleDir).filter(
    (file) => file.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(file) && !file.endsWith('.d.ts'),
  );
  const before = violations.length;
  for (const file of files) {
    const relative = slash(path.relative(moduleDir, file)),
      layer = relative.split('/')[0];
    if (!['domain', 'application', 'presentation'].includes(layer)) continue;
    const ast = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const inspect = (node) => {
      let literal;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        literal = node.moduleSpecifier;
      else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(ast) === 'require') &&
        ts.isStringLiteral(node.arguments[0])
      )
        literal = node.arguments[0];
      else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        literal = node.argument.literal;
      if (literal) {
        const spec = literal.text;
        const target = spec.startsWith('.') ? slash(path.resolve(path.dirname(file), spec)) : spec;
        let reason;
        const technical =
          /(^|\/)(infrastructure|infra|presentation|bootstrap|config)(\/|$)/.test(target) ||
          [
            'sequelize',
            'typeorm',
            'express',
            'bullmq',
            'ioredis',
            'amqplib',
            'axios',
            'jsonwebtoken',
            'bcrypt',
            'bcryptjs',
            'fs',
            'net',
            'http',
            'https',
            'node:fs',
            'node:net',
            'node:http',
            'node:https',
          ].some((packageName) => spec === packageName || spec.startsWith(packageName + '/'));
        if (layer === 'domain' && (technical || /(^|\/)application(\/|$)/.test(target)))
          reason = 'Domínio depende de camada externa';
        if (layer === 'application' && technical) reason = 'Aplicação depende de detalhe técnico';
        if (['domain', 'application'].includes(layer) && /\.module(?:\.ts)?$/.test(target))
          reason = 'Camada interna depende de composition root';
        if (
          layer === 'presentation' &&
          (/(^|\/)infrastructure(\/|$)/.test(target) || ['sequelize', 'typeorm'].includes(spec))
        )
          reason = 'Apresentação depende da implementação';
        if (reason)
          violations.push({
            module: name,
            file: slash(path.relative(root, file)),
            line: ast.getLineAndCharacterOfPosition(literal.getStart(ast)).line + 1,
            dependency: spec,
            reason,
          });
      }
      ts.forEachChild(node, inspect);
    };
    inspect(ast);
  }
  for (const layer of ['domain', 'application', 'infrastructure']) {
    if (!files.some((file) => slash(path.relative(moduleDir, file)).startsWith(layer + '/')))
      violations.push({
        module: name,
        file: slash(path.relative(root, moduleDir)),
        line: 1,
        dependency: layer,
        reason: 'Camada obrigatória ausente',
      });
  }
  for (const entry of [name + '.module.ts', 'index.ts']) {
    if (!fs.existsSync(path.join(moduleDir, entry)))
      violations.push({
        module: name,
        file: slash(path.relative(root, moduleDir)),
        line: 1,
        dependency: entry,
        reason: 'Entrada pública ausente',
      });
  }
  inventory.push({
    name,
    files: files.length,
    layers: ['domain', 'application', 'infrastructure', 'presentation'].filter((layer) =>
      files.some((file) => slash(path.relative(moduleDir, file)).startsWith(layer + '/')),
    ),
    entry: fs.existsSync(path.join(moduleDir, name + '.module.ts')),
    violations: violations.length - before,
  });
}
const lines = [
  '# Revisão arquitectural dos módulos',
  '',
  'Regras: domínio independente de frameworks; aplicação depende de contratos; apresentação depende dos casos de uso; infraestrutura implementa adaptadores. O composition root pode conhecer todas as camadas. Testes e declarações ambientais são excluídos desta contagem.',
  '',
  'Este relatório verifica imports directos e organização, não certifica por si só DDD ou Clean Code. A revisão de agregados, invariantes e contratos entre bounded contexts exige análise semântica adicional.',
  '',
  `Resultado: ${inventory.length} módulos; ${violations.length} violações das regras automatizadas.`,
  '',
  '| Módulo | Ficheiros | Camadas presentes | Entrada pública | Violações |',
  '| --- | ---: | --- | --- | ---: |',
  ...inventory.map(
    (m) =>
      `| ${m.name} | ${m.files} | ${m.layers.join(', ')} | ${m.entry ? 'Sim' : 'Não'} | ${m.violations} |`,
  ),
  '',
  '## Dependências a corrigir',
  '',
  ...violations.map((v) => `- ${v.file}:${v.line} — ${v.reason}: ${v.dependency}`),
  ...(violations.length ? [] : ['Nenhuma violação das regras automatizadas.']),
  '',
  'O motor payroll-engine é um módulo de cálculo sem interface HTTP; não precisa de controllers vazios. Preservar essa característica é compatível com as mesmas regras de dependência.',
  '',
];
if (process.argv.includes('--write'))
  fs.writeFileSync(path.join(root, 'docs/architecture-review.md'), lines.join('\n'));
process.stdout.write(
  JSON.stringify(
    {
      modules: inventory.length,
      files: inventory.reduce((sum, m) => sum + m.files, 0),
      violations: violations.length,
      inventory,
    },
    null,
    2,
  ) + '\n',
);
if (process.argv.includes('--strict') && violations.length) process.exitCode = 1;
