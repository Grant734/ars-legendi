import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { GrammarPanelProvider } from "./grammar/GrammarPanelContext";

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <GrammarPanelProvider>
        <App />
      </GrammarPanelProvider>
    </BrowserRouter>
  </React.StrictMode>
);
