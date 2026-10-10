import type { RouteObject } from 'react-router';
import { AppShell } from '../components/layout/AppShell.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';

/**
 * Route table.
 *
 * Every feature route is lazily loaded so the initial bundle only carries the
 * shell (PLAN.md section 7). The 404 page is deliberately static: a screen that
 * exists to handle failure must not itself depend on a chunk that can fail.
 */
export const routes: RouteObject[] = [
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
];
