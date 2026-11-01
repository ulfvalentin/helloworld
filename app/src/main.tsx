import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Archivo self-hosted statt Google Fonts (DSGVO): Fließtext 400–600, Titel 700–800, Urteil 900
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/archivo/800.css'
import '@fontsource/archivo/900.css'
import App from './App'
import { IS_TEST } from './lib/appEnv'
import './styles.css'

if (IS_TEST) document.title = `Test · ${document.title}`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
