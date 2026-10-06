import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { findCalculator } from '../registry';
import { ErrorBoundary } from '../components/ErrorBoundary';

type Load = { kind: 'loading' } | { kind: 'ready'; C: ComponentType } | { kind: 'failed' };

function NotFound({ what }: { what: string }) {
  return (
    <>
      <h1>Not found</h1>
      <p>
        We could not find {what}. <a href="#/">Back to the home page</a>.
      </p>
    </>
  );
}

function Loaded({ id }: { id: string }) {
  const entry = findCalculator(id);
  const [st, setSt] = useState<Load>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    setSt({ kind: 'loading' });
    entry
      ?.load()
      .then((m) => live && setSt({ kind: 'ready', C: m.default }))
      .catch(() => live && setSt({ kind: 'failed' }));
    return () => {
      live = false;
    };
  }, [entry]);
  if (!entry) return <NotFound what="that calculator" />;
  if (st.kind === 'loading') return <p role="status">Loading {entry.title}...</p>;
  if (st.kind === 'failed') {
    return <p role="alert">{entry.title} could not be loaded. Reload the page to try again.</p>;
  }
  const C = st.C;
  return (
    <>
      <h1>{entry.title}</h1>
      <C />
    </>
  );
}

export function CalcPage({ id }: { id: string }) {
  return (
    <ErrorBoundary key={id} label="This calculator">
      <Loaded id={id} />
    </ErrorBoundary>
  );
}
