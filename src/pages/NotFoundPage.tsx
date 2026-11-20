import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <>
      <h1 tabIndex={-1}>Page not found</h1>
      <p>This page does not exist.</p>
      <Link to="/">Back to the queue</Link>
    </>
  )
}
