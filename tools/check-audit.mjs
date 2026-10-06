// npm run check:audit: compliance-phrase grep + data-table audit + ledger audit (Phase 0 task 5).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAudit } from './audit-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { errors, tables, ledgerRows } = runAudit(root);
console.log(`check:audit: ${tables} data tables audited, ${ledgerRows} ledger rows checked`);
if (errors.length > 0) {
  console.error(`check:audit FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('check:audit: PASS');
