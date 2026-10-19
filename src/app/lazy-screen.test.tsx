import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasStoredSession } from '../lib/stored-session.ts';
import { lazyScreen } from './deferred-screen.tsx';

/**
 * Whether the screen's module was asked for. The mock's factory runs when the
 * module is imported, which is the thing being measured: a screen behind the
 * gate that nobody is going to see must not be downloaded.
 */
let imported = false;

vi.mock('../pages/DashboardPage.tsx', () => {
  imported = true;

  return { DashboardPage: () => <h1>Inicio</h1> };
});

const loadDashboard = () =>
  import('../pages/DashboardPage.tsx').then((module) => module.DashboardPage);

beforeEach(() => {
  imported = false;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  localStorage.clear();
});

describe('lazyScreen', () => {
  it('does not download the screen for a visitor without a session', async () => {
    const lazy = lazyScreen(loadDashboard);

    const module = await lazy();

    expect(imported).toBe(false);
    expect(module.Component).toBeTypeOf('function');
  });

  it('downloads the screen when the browser holds a session', async () => {
    localStorage.setItem(
      'sb-project-auth-token',
      JSON.stringify({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: 1_900_000_000,
      }),
    );

    expect(hasStoredSession()).toBe(true);

    const lazy = lazyScreen(loadDashboard);

    await lazy();

    expect(imported).toBe(true);
  });

  it('shows the shape of what is coming while the screen is on its way', async () => {
    const lazy = lazyScreen(loadDashboard);

    const module = await lazy();
    const Screen = module.Component;

    render(<Screen />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the real screen once it arrives', async () => {
    localStorage.setItem(
      'sb-project-auth-token',
      JSON.stringify({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: 1_900_000_000,
      }),
    );

    const lazy = lazyScreen(loadDashboard);

    const module = await lazy();
    const Screen = module.Component;

    render(<Screen />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    });
  });
});
