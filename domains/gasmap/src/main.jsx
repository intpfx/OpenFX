import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "./App.css";
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker (basic, optional)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // registration successful
    }).catch(() => {
      // ignore registration failures
    });
  });
}
