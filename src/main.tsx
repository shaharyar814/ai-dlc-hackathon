import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { isApiMode } from './api/config.ts'
import SignInMessage from './components/SignInMessage.tsx'

const root = createRoot(document.getElementById('root')!)

function render(node: ReactNode) {
  root.render(<StrictMode>{node}</StrictMode>)
}

function renderApp(app: ReactNode) {
  // HashRouter reads the hash when it mounts, so the restored route must be in place first.
  render(<HashRouter>{app}</HashRouter>)
}

async function bootstrap() {
  if (!isApiMode(import.meta.env.VITE_API_URL)) {
    // Local mode: no network code is loaded.
    renderApp(<App />)
    return
  }
  const { browserAuth, browserApiClient } = await import('./api/index.ts')
  const { createApiRepository } = await import('./storage/apiRepository.ts')
  const auth = browserAuth()
  const outcome = await auth.completeSignIn()
  if (outcome === 'failed') {
    render(<SignInMessage kind="failed" onRestart={() => void auth.startSignIn()} />)
    return
  }
  if (auth.getValidToken(Date.now()) === null) {
    await auth.startSignIn()
    return
  }
  renderApp(
    <App
      repository={createApiRepository(browserApiClient())}
      onUnauthorized={() => void auth.startSignIn()}
      signOut={{ href: auth.signOutUrl(), onSignOut: auth.clearTokens }}
    />,
  )
}

void bootstrap()
