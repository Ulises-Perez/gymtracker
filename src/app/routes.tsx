import type { RouteObject } from 'react-router';

import { AppShell } from '../components/layout/AppShell.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';
import { hydrateFallback, lazyScreen } from './deferred-screen.tsx';
import { RequireAuth } from './RequireAuth.tsx';

/**
 * Route table.
 *
 * Every feature route is lazily loaded so the initial bundle only carries the
 * shell (PLAN.md section 7). The 404 page is deliberately static: a screen that
 * exists to handle failure must not itself depend on a chunk that can fail.
 *
 * The whole shell sits behind one pathless `RequireAuth` route, so the gate is
 * declared once instead of per screen. The 404 stays inside it on purpose: a
 * signed-out visitor should not land on a page with app chrome to explore.
 *
 * The auth screens are siblings of the gate, not children: they are what a
 * visitor without a session has to be able to reach. Being lazy keeps Zod and
 * React Hook Form in their own chunks (A8).
 *
 * The screens behind the gate go through `lazyScreen`, which does not download
 * them for a visitor who is going to be sent to the login screen instead.
 */
export const routes: RouteObject[] = [
  {
    path: '/login',
    HydrateFallback: hydrateFallback,
    lazy: async () => {
      const { LoginPage } = await import('../pages/LoginPage.tsx');

      return { Component: LoginPage };
    },
  },
  {
    path: '/register',
    HydrateFallback: hydrateFallback,
    lazy: async () => {
      const { RegisterPage } = await import('../pages/RegisterPage.tsx');

      return { Component: RegisterPage };
    },
  },
  {
    path: '/forgot-password',
    HydrateFallback: hydrateFallback,
    lazy: async () => {
      const { ForgotPasswordPage } = await import('../pages/ForgotPasswordPage.tsx');

      return { Component: ForgotPasswordPage };
    },
  },
  {
    path: '/reset-password',
    HydrateFallback: hydrateFallback,
    lazy: async () => {
      const { ResetPasswordPage } = await import('../pages/ResetPasswordPage.tsx');

      return { Component: ResetPasswordPage };
    },
  },
  {
    element: <RequireAuth />,
    HydrateFallback: hydrateFallback,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          {
            index: true,
            lazy: lazyScreen(() =>
              import('../pages/DashboardPage.tsx').then((m) => m.DashboardPage),
            ),
          },
          {
            path: 'workout',
            lazy: lazyScreen(() => import('../pages/WorkoutPage.tsx').then((m) => m.WorkoutPage)),
          },
          {
            path: 'history',
            lazy: lazyScreen(() => import('../pages/HistoryPage.tsx').then((m) => m.HistoryPage)),
          },
          {
            path: 'history/:workoutId',
            lazy: lazyScreen(() =>
              import('../pages/WorkoutDetailPage.tsx').then((m) => m.WorkoutDetailPage),
            ),
          },
          {
            path: 'history/exercise/:exerciseId',
            lazy: lazyScreen(() =>
              import('../pages/ExerciseDetailPage.tsx').then((m) => m.ExerciseDetailPage),
            ),
          },
          {
            path: 'profile',
            lazy: lazyScreen(() => import('../pages/ProfilePage.tsx').then((m) => m.ProfilePage)),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
