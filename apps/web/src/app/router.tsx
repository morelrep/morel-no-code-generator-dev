import {
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
} from '@tanstack/react-router'
import { AuthCallbackPage } from '../routes/auth.callback'
import { IndexPage } from '../routes/index'
import { SecuritySettingsPage } from '../routes/settings.security'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
})

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallbackPage,
})

const settingsSecurityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/security',
  component: SecuritySettingsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  authCallbackRoute,
  settingsSecurityRoute,
])

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
