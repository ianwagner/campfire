import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  import.meta.env.PROD ? (
    <App />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);
