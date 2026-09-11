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

/*
 * Cache the app so the second visit is instant and an offline one still works. It
 * is registered after load rather than during it: the worker's own install would
 * otherwise compete for the network with the bundles the first visit is waiting on.
 */
if ('serviceWorker' in navigator) {
  /**
   * Hand the worker the list of what this page actually loaded, so it can store it.
   *
   * The first visit is over before the worker exists, so none of its downloads went
   * through the worker and none of them are cached. Reporting them afterwards is
   * what makes the *second* visit instant — and it needs no generated manifest to
   * be kept in step with the build, because the page knows exactly what it used.
   */
  const warm = () => {
    const worker = navigator.serviceWorker.controller
    if (!worker) return
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => url.startsWith(window.location.origin))
    worker.postMessage({ type: 'warm', urls: [window.location.href, ...urls] })
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(warm)
      .catch(() => {
        /* caching is an optimisation; the app works without it */
      })
    // A worker installed by this very load only takes control a moment later.
    navigator.serviceWorker.addEventListener('controllerchange', warm)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
