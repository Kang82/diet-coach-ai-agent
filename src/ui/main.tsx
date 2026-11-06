import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccessGate } from './AccessGate.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessGate />
  </StrictMode>,
);
