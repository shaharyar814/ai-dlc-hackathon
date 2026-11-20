import { useLocation } from 'react-router-dom'
import './App.css'
import Header from './components/Header.tsx'
import LoadStatus from './components/LoadStatus.tsx'
import SignInMessage from './components/SignInMessage.tsx'
import { EVALUATION_TIME } from './config.ts'
import { useRouteEffects } from './hooks/useRouteEffects.ts'
import DataQualityPage from './pages/DataQualityPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import OrderPage from './pages/OrderPage.tsx'
import QueuePage from './pages/QueuePage.tsx'
import RulePage from './pages/RulePage.tsx'
import WorkbenchProvider from './state/WorkbenchProvider.tsx'
import { useWorkbench } from './state/workbenchContext.ts'
import type { ApiRepository } from './storage/apiRepository.ts'
import type { LocalRepository } from './storage/localRepository.ts'
import type { StorageLike } from './storage/reviews.ts'
import type { RawOrder } from './types.ts'
import { resolveRoute } from './view/routes.ts'

interface AppProps {
  dataset?: readonly RawOrder[]
  storage?: StorageLike | null
  now?: () => Date
  /** API mode when this is an ApiRepository. Omit for Local mode. */
  repository?: LocalRepository | ApiRepository
  onUnauthorized?: () => void
  /** API mode only: shows the Sign out link in the header. */
  signOut?: { href: string; onSignOut: () => void }
}

function Shell({ signOut }: { signOut?: AppProps['signOut'] }) {
  const { result, rerun, status = 'ready', loading = false, evaluationTime, reload } = useWorkbench()
  const { pathname } = useLocation()
  useRouteEffects(pathname)
  if (status === 'forbidden') {
    return (
      <main>
        <SignInMessage kind="not-in-group" />
      </main>
    )
  }
  if (status === 'loading' || status === 'error') {
    return (
      <main>
        <LoadStatus state={status} busy={loading} onRetry={() => reload?.()} />
      </main>
    )
  }
  const match = resolveRoute(pathname)

  let page
  switch (match.kind) {
    case 'queue-open':
      page = <QueuePage view="open" />
      break
    case 'queue-reviewed':
      page = <QueuePage view="reviewed" />
      break
    case 'order':
      page = <OrderPage orderId={match.orderId} />
      break
    case 'data-quality':
      page = <DataQualityPage />
      break
    case 'rule':
      page = <RulePage />
      break
    case 'not-found':
      page = <NotFoundPage />
      break
  }

  return (
    <>
      <Header
        checkedCount={result.checkedCount}
        skippedCount={result.skipped.length}
        evaluationTime={evaluationTime ?? EVALUATION_TIME}
        onRerun={rerun}
        signOutHref={signOut?.href}
        onSignOut={signOut?.onSignOut}
      />
      <main>{page}</main>
    </>
  )
}

export default function App({
  dataset,
  storage,
  now,
  repository,
  onUnauthorized,
  signOut,
}: AppProps) {
  return (
    <WorkbenchProvider
      dataset={dataset}
      storage={storage}
      now={now}
      repository={repository}
      onUnauthorized={onUnauthorized}
    >
      <Shell signOut={signOut} />
    </WorkbenchProvider>
  )
}
