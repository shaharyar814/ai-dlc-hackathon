import { Link, useLocation } from 'react-router-dom'
import { NAV_ITEMS, navCurrent, resolveRoute } from '../view/routes.ts'

export default function NavBar() {
  const { pathname } = useLocation()
  const current = navCurrent(resolveRoute(pathname))

  return (
    <nav aria-label="Main">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          aria-current={item.key === current ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
