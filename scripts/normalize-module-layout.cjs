/* Rewrites module paths without changing exported APIs or business behaviour. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const moduleRoot = path.join(sourceRoot, 'modules');
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );
const files = walk(sourceRoot).filter((file) => /\.[cm]?[jt]sx?$/.test(file));
const moves = new Map();
for (const file of files) {
  if (!file.startsWith(moduleRoot + path.sep)) continue;
  let relative = path.relative(moduleRoot, file).replace(/\\/g, '/');
  relative = relative.replace(
    '/infrastructure/persistence/model/',
    '/infrastructure/persistence/models/',
  );
  relative = relative.replace(
    /\/infrastructure\/http\/(controllers?|routes?|middlewares?|schemas?)\//,
    (_m, name) => `/presentation/${name.endsWith('s') ? name : name + 's'}/`,
  );
  relative = relative.replace(
    /\/presentation\/([^/]+\.controller\.ts)$/,
    '/presentation/controllers/$1',
  );
  relative = relative.replace(/\/presentation\/([^/]+\.routes\.ts)$/, '/presentation/routes/$1');
  relative = relative.replace(/\/presentation\/([^/]+\.schema\.ts)$/, '/presentation/schemas/$1');
  relative = relative.replace(
    /\/infrastructure\/([^/]+\.models?\.ts)$/,
    '/infrastructure/persistence/models/$1',
  );
  relative = relative.replace(
    /\/infrastructure\/([^/]+\.repository\.ts)$/,
    '/infrastructure/persistence/repositories/$1',
  );
  relative = relative.replace(/\/infrastructure\/([^/]*runtime\.ts)$/, '/infrastructure/jobs/$1');
  relative = relative.replace(/\/application\/([^/]+\.ports?\.ts)$/, '/application/ports/$1');
  relative = relative.replace(/\/application\/([^/]+\.service\.ts)$/, '/application/use-cases/$1');
  relative = relative.replace(/\/application\/([^/]+\.use-case\.ts)$/, '/application/use-cases/$1');
  relative = relative.replace(
    '/infrastructure/provider-callback.ts',
    '/presentation/middlewares/provider-callback.ts',
  );
  relative = relative.replace(
    '/infrastructure/provider-webhook.ts',
    '/presentation/middlewares/provider-webhook.ts',
  );
  relative = relative.replace(
    'tenancy/application/onboarding-provisioning.ts',
    'tenancy/infrastructure/adapters/onboarding-provisioning.ts',
  );
  relative = relative.replace(
    'user/application/ports/event-publisher.ts',
    'user/domain/events/event-publisher.port.ts',
  );
  relative = relative.replace('/infrastructure/http/dto/', '/presentation/dto/');
  relative = relative.replace(
    'auth/infrastructure/security/rate-limiter.ts',
    'auth/presentation/middlewares/rate-limiter.ts',
  );
  const destination = path.resolve(moduleRoot, relative);
  if (destination !== file) moves.set(file, destination);
}
for (const [from, to] of moves) {
  if (!from.startsWith(moduleRoot + path.sep) || !to.startsWith(moduleRoot + path.sep))
    throw new Error('Path escapes the modules directory.');
  if (fs.existsSync(to) && from !== to) throw new Error(`Destination already exists: ${to}`);
}
if (!process.argv.includes('--apply')) {
  process.stdout.write(
    JSON.stringify(
      [...moves].map(([from, to]) => ({
        from: path.relative(root, from),
        to: path.relative(root, to),
      })),
      null,
      2,
    ),
  );
  process.exit(0);
}
const resolve = (from, specifier) => {
  const base = path.resolve(path.dirname(from), specifier);
  return [
    base,
    base + '.ts',
    base + '.tsx',
    base + '.js',
    path.join(base, 'index.ts'),
    path.join(base, 'index.js'),
  ].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
};
const contents = new Map();
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) && node.text.startsWith('.')) {
      const target = resolve(file, node.text);
      if (target && (moves.has(file) || moves.has(target))) {
        let specifier = path
          .relative(path.dirname(moves.get(file) || file), moves.get(target) || target)
          .replace(/\\/g, '/');
        if (!/\.[jt]sx?$/.test(node.text)) specifier = specifier.replace(/\.[jt]sx?$/, '');
        if (!specifier.startsWith('.')) specifier = './' + specifier;
        if (specifier !== node.text)
          edits.push({ start: node.getStart(ast) + 1, end: node.end - 1, value: specifier });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  let updated = content;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    updated = updated.slice(0, edit.start) + edit.value + updated.slice(edit.end);
  if (updated !== content || moves.has(file)) contents.set(file, updated);
}
// All targets and rewrites are validated before the first write.
for (const [file, content] of contents) fs.writeFileSync(file, content);
for (const [from, to] of moves) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}
process.stdout.write(`Normalized ${moves.size} files and updated ${contents.size} source files.\n`);
