import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Archivo self-hosted statt Google Fonts (DSGVO): Fließtext 400–600, Überschriften 800
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/800.css'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
