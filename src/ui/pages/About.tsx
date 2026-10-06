import { LEDGER } from '../../core/data/ledger';
import { UnverifiedBadge } from '../components/UnverifiedBadge';

export function About() {
  return (
    <>
      <h1>About and sources</h1>
      <div class="notice" role="note">
        <p>
          This tool does not certify compliance with any standard. Results are engineering estimates. Every IPC and IEC
          value, coefficient and table must be checked by a qualified person against the licensed standard before it is
          relied on. Your fabricator&apos;s capabilities and your own review take precedence.
        </p>
      </div>
      <h2>Source ledger</h2>
      <p>
        Each constant or formula used by a calculator is tracked here. Anything not marked VERIFIED is flagged wherever
        it is used.
      </p>
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">Source ledger: id, item, edition and verification status</caption>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Item</th>
              <th scope="col">Edition</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {LEDGER.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.id}</th>
                <td>{r.item}</td>
                <td>{r.edition}</td>
                <td>
                  {r.status === 'VERIFIED' ? <span>VERIFIED</span> : <UnverifiedBadge status={r.status} ledgerIds={[r.id]} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
