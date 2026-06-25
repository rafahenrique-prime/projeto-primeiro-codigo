import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './theme.jsx'
import { syncFromSupabase } from './services/followUpService'
import { syncCatalogFromSupabase } from './services/catalog'
import './index.css'

syncFromSupabase()        // carrega follow-up do Supabase para localStorage
syncCatalogFromSupabase() // carrega catálogo do Supabase para localStorage

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
)
