'use strict';
// Copies declarative SQL schema literals into a frozen migration; never loads TypeScript.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'src/modules/ai-assistant/infrastructure/persistence/models');
const definitions = [];
function balanced(text, start, open, close) {
  let depth = 0, quote = null, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error('Unbalanced schema');
}
for (const file of fs.readdirSync(folder).filter(f => f.endsWith('.model.ts'))) {
  const text = fs.readFileSync(path.join(folder, file), 'utf8');
  for (const match of text.matchAll(/\w+Model\.init\(\s*/g)) {
    const start = match.index + match[0].length;
    const columns = balanced(text, start, '{', '}');
    const optionsStart = text.indexOf('{', start + columns.length);
    const options = balanced(text, optionsStart, '{', '}');
    const table = /tableName:\s*'([^']+)'/.exec(options)?.[1];
    if (!table) throw new Error('Missing table name');
    const indexStart = options.indexOf('indexes:');
    const indexes = indexStart < 0 ? '[]' : balanced(options, options.indexOf('[', indexStart), '[', ']');
    definitions.push(`{table:'${table}',columns:${columns},indexes:${indexes},updated:${!options.includes('updatedAt: false')}}`);
  }
}
const target = path.join(root, 'src/infra/database/helpers/ai-schema.cjs');
if (fs.existsSync(target)) throw new Error('Schema snapshot already exists; use an incremental migration.');
fs.writeFileSync(target, "'use strict';\nmodule.exports = (DataTypes) => [\n" + definitions.join(',\n') + '\n];\n');
console.log(`Prepared ${definitions.length} table definitions.`);
