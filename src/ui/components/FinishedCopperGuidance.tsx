import { finishedGuidance } from '../calculators/copper-source';

/** Published finished thicknesses from the bundled fab profile. Nothing here is computed or invented. */
export function FinishedCopperGuidance() {
  const g = finishedGuidance();
  return (
    <div class="callout" role="note" aria-labelledby="finished-h">
      <p id="finished-h">
        <strong>Finished copper depends on the fab and the layer.</strong> The weight on an order form is a label, not a thickness.
      </p>
      {g === null || g.rows.length === 0 ? (
        <p>No finished thicknesses are available in the fab profile. Ask your fabricator for the finished thickness per layer.</p>
      ) : (
        <>
          <p>
            Fab profile: {g.fabricator}, dated {g.profileDate}, status {g.status}
            {g.ledgerIds.length > 0 ? `, ledger ${g.ledgerIds.join(', ')}` : ''}.
          </p>
          <ul>
            {g.rows.map((r) => (
              <li key={r.label}>
                {r.label}: {r.text}
              </li>
            ))}
          </ul>
          <p class="muted">{g.caveat}</p>
        </>
      )}
    </div>
  );
}
