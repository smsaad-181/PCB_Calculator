export function AssumptionsList({ assumptions }: { readonly assumptions: readonly string[] }) {
  if (assumptions.length === 0) return null;
  return (
    <section aria-labelledby="assump-h">
      <h3 id="assump-h">Assumptions</h3>
      <ul>
        {assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </section>
  );
}
