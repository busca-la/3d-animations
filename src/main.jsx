import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './studios.css';
import './mcp.css';
import './film.css';
import './voice.css';
import './city.css';
import './plans.css';
import './account.css';
import './chat.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
