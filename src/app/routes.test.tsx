import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './routes.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return render(<RouterProvider router={router} />);
}

describe('app routes', () => {
  it('renders the shell and the dashboard on the root route', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('resolves each lazily loaded route by its own address', async () => {
    renderAt('/history');

    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeInTheDocument();
  });

  it('resolves the workout route', async () => {
    renderAt('/workout');

    expect(await screen.findByRole('heading', { name: 'Entrenar' })).toBeInTheDocument();
  });

  it('falls back to the not-found screen for an unknown route', async () => {
    renderAt('/ruta-que-no-existe');

    expect(await screen.findByRole('heading', { name: /no encontrada/i })).toBeInTheDocument();
  });
});
