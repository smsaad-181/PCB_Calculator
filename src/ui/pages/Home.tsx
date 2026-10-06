import { CATEGORIES, calculatorsIn } from '../registry';

export function Home() {
  return (
    <>
      <h1>PCB Calculator Suite</h1>
      <p>
        Engineering estimates with visible formulas, assumptions and source status. Nothing here certifies a design;
        see <a href="#/about">About</a>.
      </p>
      <div class="cards">
        {CATEGORIES.map((c) => {
          const items = calculatorsIn(c.id);
          return (
            <section class="card" key={c.id} aria-labelledby={`cat-${c.id}`}>
              <h2 id={`cat-${c.id}`}>{c.title}</h2>
              {items.length === 0 ? (
                <p class="muted">Coming in phase {c.phase}.</p>
              ) : (
                <ul>
                  {items.map((e) => (
                    <li key={e.id}>
                      <a href={`#/calc/${e.id}`}>{e.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
