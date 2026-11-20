import { useLocation } from 'react-router-dom'
import './App.css'
import Header from './components/Header.tsx'
import { EVALUATION_TIME } from './config.ts'
import { useRouteEffects } from './hooks/useRouteEffects.ts'
import DataQualityPage from './pages/DataQualityPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import OrderPage from './pages/OrderPage.tsx'
import QueuePage from './pages/QueuePage.tsx'
import RulePage from './pages/RulePage.tsx'
import WorkbenchProvider from './state/WorkbenchProvider.tsx'
import { useWorkbench } from './state/workbenchContext.ts'
import type { StorageLike } from './storage/reviews.ts'
import type { RawOrder } from './types.ts'
import { resolveRoute } from './view/routes.ts'

interface AppProps {
  dataset?: readonly RawOrder[]
  storage?: StorageLike | null
  now?: () => Date
}

function Shell() {
  const { result, rerun } = useWorkbench()
  const { pathname } = useLocation()
  useRouteEffects(pathname)
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
        evaluationTime={EVALUATION_TIME}
        onRerun={rerun}
      />
      <main>{page}</main>
    </>
  )
}

export default function App({ dataset, storage, now }: AppProps) {
  return (
    <WorkbenchProvider dataset={dataset} storage={storage} now={now}>
      <Shell />
    </WorkbenchProvider>
  )
}
