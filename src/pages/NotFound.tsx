import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
      <p className="text-gray-600">The page you requested could not be found.</p>
      <Link to="/" className="text-primary font-medium hover:underline">Back to home</Link>
    </main>
  )
}

export default NotFound
