import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readmes = [
  "README.md",
  "README.es.md",
  "README.de.md",
  "README.fr.md",
  "README.id.md",
  "README.ru.md",
  "README.tr.md",
  "README.zh-CN.md",
];

/** Rows of the `| \`VAR\` | ... | \`default\` |` env tables: name + default only. */
function parseEnvRows(text) {
  const rows = new Map();
  for (const line of text.split("\n")) {
    const match = line.match(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|.*\|\s*`([^`]*)`\s*\|?\s*$/);
    if (match) rows.set(match[1], match[2]);
  }
  return rows;
}

let failed = false;
const base = parseEnvRows(readFileSync(join(root, readmes[0]), "utf-8"));
console.log(`base ${readmes[0]}: ${base.size} env vars`);

for (const file of readmes.slice(1)) {
  const rows = parseEnvRows(readFileSync(join(root, file), "utf-8"));
  for (const [name, baseDefault] of base) {
    if (!rows.has(name)) {
      console.error(`MISSING ${name} in ${file}`);
      failed = true;
    } else if (rows.get(name) !== baseDefault) {
      console.error(
        `DEFAULT MISMATCH ${name} in ${file}: ${readmes[0]}=\`${baseDefault}\` vs \`${rows.get(name)}\``,
      );
      failed = true;
    }
  }
  for (const name of rows.keys()) {
    if (!base.has(name)) {
      console.error(`EXTRA ${name} in ${file} (missing from ${readmes[0]})`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("\nREADME parity check failed");
  process.exit(1);
}
console.log("README parity ok");
