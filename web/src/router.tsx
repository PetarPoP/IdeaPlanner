import { Navigate, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: false,
    defaultPreload: 'intent',
    // Unknown paths (a stale link, a typo) go to the last board instead of an error.
    defaultNotFoundComponent: () => <Navigate to="/" replace />,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
