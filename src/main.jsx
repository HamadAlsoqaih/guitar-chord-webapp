import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { tier } from './machine/quality.js'

/*
 * Publish the quality tier on the document so the page's own effects can back off
 * on a weak device the same way the 3D scene does. The heavy one is the frosted
 * card: a backdrop blur is re-composited whenever anything behind it changes, and
 * on a low-end GPU that is a real slice of the frame for an effect nobody would
 * miss.
 */
document.documentElement.dataset.quality = tier().name

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
