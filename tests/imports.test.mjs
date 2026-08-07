// Does every module import what it uses?
//
// This exists because it found something. `FLASK_BY_ID` was referenced in
// expedition.js from the commit that split that file along its seams, and the
// import did not come with it. Any party carrying a flask threw a
// ReferenceError inside buildRun and the dispatch died on the spot — for
// months, across a dozen commits, with the whole suite green.
//
// Nothing caught it because nothing ever dispatched a party with a flask, and
// a reference to a missing binding costs nothing until the line runs. That is
// the shape of the hazard in a project with no build step and no linter: a
// module can be wrong in a way that only one branch reveals.
//
// The check is deliberately narrow rather than a half-written linter. It looks
// only at SHOUTING_CASE and *_BY_ID names — the project's data tables and
// constants, which is exactly what gets left behind when code moves between
// files — and only flags one that some module in src exports. Anything else
// would need a real parser to say anything true about.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, eq } from './assert.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Names bound in this file: imported, declared, or destructured. */
function boundNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':').pop().trim().split('=')[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** Every name exported by anything in src. */
function exportedNames(files) {
  const names = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(m[1]);
    }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
  }
  return names;
}

export default async function run() {
  suite('imports');

  await test('no module uses a constant it never imported', async () => {
    const files = sourceFiles(SRC);
    const exported = exportedNames(files);
    const problems = [];

    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf8');
      const bound = boundNames(raw);
      // Strip comments and strings: a name inside either is not a reference.
      const body = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""');

      const seen = new Set();
      // Not preceded by a dot: `Save.AUTOSAVE_SECONDS` is a member access on an
      // imported namespace, not a bare binding this file has to have.
      for (const m of body.matchAll(/(^|[^.\w$])([A-Z][A-Z0-9_]{2,}|[A-Z][a-zA-Z0-9]*_BY_ID)\b/g)) {
        const name = m[2];
        if (seen.has(name) || bound.has(name) || !exported.has(name)) continue;
        seen.add(name);
        problems.push(`${path.relative(ROOT, file)} uses ${name}`);
      }
    }

    eq(problems.length, 0, problems.join('; '));
    return `${files.length} modules, every constant they use is imported`;
  });
}
