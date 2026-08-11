import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { FilePlayer } from './FilePlayer.js';
import './style.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Unable to locate the media player root');
}

createRoot(root).render(
  <StrictMode>
    <FilePlayer />
  </StrictMode>,
);
