const fs = require('fs'),
  path = require('path'),
  ts = require('typescript');
const root = path.resolve(__dirname, '../src/modules');
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
let count = 0;
for (const file of walk(root).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
  const text = fs.readFileSync(file, 'utf8'),
    ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
    names = new Set();
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const edits = [];
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !node.importClause) continue;
    const clause = node.importClause;
    let defaultName = clause.name && names.has(clause.name.text) ? clause.name : undefined,
      bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      const elements = bindings.elements.filter((e) => names.has(e.name.text));
      bindings = elements.length ? ts.factory.updateNamedImports(bindings, elements) : undefined;
    } else if (bindings && !names.has(bindings.name.text)) bindings = undefined;
    if (!defaultName && !bindings) {
      edits.push({ start: node.getStart(ast), end: node.end, value: '' });
      continue;
    }
    const updated = ts.factory.updateImportDeclaration(
      node,
      node.modifiers,
      ts.factory.updateImportClause(clause, clause.isTypeOnly, defaultName, bindings),
      node.moduleSpecifier,
      node.attributes,
    );
    const printed = ts.createPrinter().printNode(ts.EmitHint.Unspecified, updated, ast);
    edits.push({ start: node.getStart(ast), end: node.end, value: printed });
  }
  let output = text;
  for (const e of edits.sort((a, b) => b.start - a.start))
    output = output.slice(0, e.start) + e.value + output.slice(e.end);
  if (output !== text) {
    fs.writeFileSync(file, output);
    count++;
  }
}
console.log(`Cleaned imports in ${count} module files.`);
