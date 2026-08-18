import React from 'react';
import { createRoot } from 'react-dom/client';
import EmailBlastArtifact from './EmailBlastArtifact.jsx';
import './artifact.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EmailBlastArtifact />
  </React.StrictMode>,
);
