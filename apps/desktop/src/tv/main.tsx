import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../index.css';
import '../Teleprompter.css';
import { TvApp } from './TvApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TvApp />
  </StrictMode>,
);
