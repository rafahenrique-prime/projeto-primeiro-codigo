import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './theme.jsx'
import { syncFromSupabase } from './services/followUpService'
import { syncCatalogFromSupabase } from './services/catalog'
import './index.css'

syncFromSupabase()
syncCatalogFromSupabase()

// Captura token via URL — bookmarklet envia ?gptmaker_token=eyJ...
const _tk = new URLSearchParams(window.location.search).get('gptmaker_token')
if (_tk && _tk.startsWith('eyJ')) {
  localStorage.setItem('gptmaker_user_token', _tk)
  window.history.replaceState({}, '', window.location.pathname)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
)
