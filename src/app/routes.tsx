import type { RouteObject } from 'react-router';

import { AppShell } from '../components/layout/AppShell.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';
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
 */
export const routes: RouteObject[] = [
  {
    path: '/login',
    lazy: async () => {
      const { LoginPage } = await import('../pages/LoginPage.tsx');

      return { Component: LoginPage };
    },
  },
  {
    path: '/register',
    lazy: async () => {
      const { RegisterPage } = await import('../pages/RegisterPage.tsx');

      return { Component: RegisterPage };
    },
  },
  {
    path: '/forgot-password',
    lazy: async () => {
      const { ForgotPasswordPage } = await import('../pages/ForgotPasswordPage.tsx');

      return { Component: ForgotPasswordPage };
    },
  },
  {
    path: '/reset-password',
    lazy: async () => {
      const { ResetPasswordPage } = await import('../pages/ResetPasswordPage.tsx');

      return { Component: ResetPasswordPage };
    },
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          {
            index: true,
            lazy: async () => {
              const { DashboardPage } = await import('../pages/DashboardPage.tsx');

              return { Component: DashboardPage };
            },
          },
          {
            path: 'workout',
            lazy: async () => {
              const { WorkoutPage } = await import('../pages/WorkoutPage.tsx');

              return { Component: WorkoutPage };
            },
          },
          {
            path: 'history',
            lazy: async () => {
              const { HistoryPage } = await import('../pages/HistoryPage.tsx');

              return { Component: HistoryPage };
            },
          },
          {
            path: 'profile',
            lazy: async () => {
              const { ProfilePage } = await import('../pages/ProfilePage.tsx');

              return { Component: ProfilePage };
            },
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
