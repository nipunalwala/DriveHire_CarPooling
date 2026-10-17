import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

async function filesIn(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)],
    ),
  );
  return nested.flat().filter((file) => ['.ts', '.tsx', '.js', '.mjs'].includes(extname(file)));
}
function inside(directory, file) {
  const rel = relative(directory, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
export async function checkBoundaries(root) {
  const issues = [];
  const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));
  for (const section of ['apps/web/src', 'packages/contracts/src']) {
    const own = resolve(root, section);
    const shared = resolve(root, 'packages/contracts/src');
    for (const file of await filesIn(own)) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      function inspect(node) {
        let module;
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteralLike(node.moduleSpecifier)
        )
          module = node.moduleSpecifier.text;
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          if (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
            module = node.arguments[0].text;
          else issues.push(`${relative(root, file)} imports an unresolved computed dependency`);
        }
        if (module) {
          const forbiddenPackage =
            module.startsWith('node:') ||
            builtins.has(module) ||
            module === 'pg' ||
            module.startsWith('pg/') ||
            module.startsWith('@prisma/') ||
            module === 'prisma' ||
            module.startsWith('prisma/') ||
            (module.startsWith('@drivehire/') && module !== '@drivehire/contracts');
          const forbiddenAbsolute = /^(?:[a-z][a-z0-9+.-]*:|[/\\])/i.test(module);
          const forbiddenRelative =
            module.startsWith('.') &&
            !inside(own, resolve(dirname(file), module)) &&
            !(section === 'apps/web/src' && inside(shared, resolve(dirname(file), module)));
          if (forbiddenPackage || forbiddenRelative || forbiddenAbsolute)
            issues.push(`${relative(root, file)} imports forbidden dependency ${module}`);
        }
        ts.forEachChild(node, inspect);
      }
      inspect(source);
    }
  }
  return issues;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const issues = await checkBoundaries(process.cwd());
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else console.log('Browser and shared-contract dependency boundaries verified.');
}
