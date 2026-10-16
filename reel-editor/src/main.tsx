import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useEditor } from './state/store';
import './styles.css';

// Small debugging handle, used by the browser tests.
Object.assign(window, {
  __reel: {
    state: () => useEditor.getState(),
    setPlayhead: (t: number) => useEditor.getState().setPlayhead(t),
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
