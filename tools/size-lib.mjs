// Pure budget evaluation for check:size (no fs, no globals). Input mirrors Vite's
// dist/.vite/manifest.json plus a map of built JS file -> gzip bytes.

/** Route name from a manifest key such as "src/ui/calculators/TraceWidth.tsx". */
export function routeName(key) {
  const base = key.split('/').pop() ?? key;
  const stem = base.replace(/\.[^.]+$/, '');
  // Built chunk files (no manifest) carry a content hash: Name-AbCd1234.js
  return base.endsWith('.js') ? stem.replace(/-[A-Za-z0-9_-]{8}$/, '') : stem;
}

/** Files reachable from `key` through static `imports` (cycle-safe, each file once). */
function staticClosure(manifest, key, into) {
  const stack = [key];
  const seen = new Set();
  while (stack.length > 0) {
    const k = stack.pop();
    if (seen.has(k)) continue;
    seen.add(k);
    const chunk = manifest[k];
    if (!chunk) throw new Error(`manifest references unknown chunk "${k}"`);
    into.add(chunk.file);
    for (const dep of chunk.imports ?? []) stack.push(dep);
  }
}

/**
 * First-load per route = entry static closure + route chunk static closure, each file once.
 * Routes = dynamic imports of the entry's static closure (the registry's lazy imports).
 * Total = every JS file measured, including any not in the manifest.
 */
export function evaluateBudget({ manifest, sizes, firstLoadBudget, totalBudget }) {
  const entryKeys = Object.keys(manifest).filter((k) => manifest[k].isEntry);
  if (entryKeys.length === 0) throw new Error('manifest has no entry chunk');

  const entryFiles = new Set();
  const routeKeys = new Set();
  for (const e of entryKeys) staticClosure(manifest, e, entryFiles);
  for (const c of Object.values(manifest)) {
    if (entryFiles.has(c.file)) {
      for (const d of c.dynamicImports ?? []) routeKeys.add(d);
    }
  }
  if (routeKeys.size === 0) throw new Error('manifest has no route (dynamic import) chunks');

  const sizeOf = (file) => {
    const s = sizes[file];
    if (typeof s !== 'number') throw new Error(`no measured size for ${file}`);
    return s;
  };

  const routes = [];
  for (const key of routeKeys) {
    const files = new Set(entryFiles);
    staticClosure(manifest, key, files);
    let bytes = 0;
    for (const f of files) bytes += sizeOf(f);
    routes.push({ route: routeName(key), key, bytes, files: [...files].sort() });
  }
  routes.sort((a, b) => b.bytes - a.bytes || a.route.localeCompare(b.route));

  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const failures = [];
  for (const r of routes) {
    if (r.bytes > firstLoadBudget) {
      failures.push(`route ${r.route}: first-load ${r.bytes} bytes exceeds ${firstLoadBudget} bytes`);
    }
  }
  if (total > totalBudget) {
    failures.push(`total JS ${total} bytes exceeds total ceiling ${totalBudget} bytes`);
  }
  return { routes, largest: routes[0], total, ok: failures.length === 0, failures };
}
