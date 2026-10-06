import { render } from 'preact';

function App() {
  return <h1>PCB Calculator Suite</h1>;
}

const root = document.getElementById('app');
if (root) render(<App />, root);
