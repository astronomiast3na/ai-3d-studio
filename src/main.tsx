import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Handy for debugging and automation from the console.
import { useStore } from './store';
import { applyOperations } from './ai';
(window as any).studio = { useStore, applyOperations };
