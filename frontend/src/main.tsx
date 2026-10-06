import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { loadLocale, redirectToPreferred } from './lib/i18n'

// The language comes from the address (/es/...). First visit without one: follow the browser's language.
// The dictionary is loaded before the app's modules run, so labels built at module level are translated too.
if (!redirectToPreferred()) {
  loadLocale().then(() => import('./App')).then(({ default: App }) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
}
