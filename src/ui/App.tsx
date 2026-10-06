import { useEffect, useState } from 'preact/hooks';
import { useParsedHash } from '../state/useHash';
import { DiscardBanner } from './components/DiscardBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { About } from './pages/About';
import { CalcPage } from './pages/CalcPage';
import { Home } from './pages/Home';

function focusMain(): void {
  document.getElementById('main')?.focus({ preventScroll: true });
}

export function App() {
  const parsed = useParsedHash();
  const { route } = parsed;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const key = route.name === 'calc' ? `calc:${route.id}` : route.name;

  useEffect(focusMain, [key]);

  return (
    <>
      <a
        class="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          focusMain();
        }}
      >
        Skip to main content
      </a>
      <header>
        <nav aria-label="Primary">
          <strong class="brand">PCB Calculator Suite</strong>
          <a href="#/" aria-current={route.name === 'home' ? 'page' : undefined}>
            Home
          </a>
          <a href="#/about" aria-current={route.name === 'about' ? 'page' : undefined}>
            About
          </a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {dismissedFor !== parsed.hash && <DiscardBanner parsed={parsed} onDismiss={() => {
              setDismissedFor(parsed.hash);
              focusMain();
            }} />}
        <ErrorBoundary key={key} label="This page">
          {route.name === 'home' && <Home />}
          {route.name === 'about' && <About />}
          {route.name === 'calc' && <CalcPage id={route.id} />}
          {route.name === 'notfound' && (
            <>
              <h1>Page not found</h1>
              <p>
                That address does not exist. <a href="#/">Back to the home page</a>.
              </p>
            </>
          )}
        </ErrorBoundary>
      </main>
      <footer>
        <p>Estimates only. Not a compliance certification. Verify IPC/IEC values against the licensed standard.</p>
      </footer>
    </>
  );
}
