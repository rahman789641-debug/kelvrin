import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Only show 5s loader when software is closed and reopened (fresh session) or first visit.
// On simple page reload, dismiss immediately with 0s delay!
if ((window as any).__IS_PAGE_RELOAD__) {
  if (typeof (window as any).Loader?.done === 'function') {
    (window as any).Loader.done();
  }
} else {
  setTimeout(() => {
    if (typeof (window as any).Loader?.done === 'function') {
      (window as any).Loader.done();
    }
  }, 5000);
}

