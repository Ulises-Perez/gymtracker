import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav.tsx';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('exposes exactly the four MVP destinations, in order', () => {
    renderAt('/');

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);

    expect(labels).toEqual(['Inicio', 'Entrenar', 'Historial', 'Perfil']);
  });

  it('marks the current destination for assistive technology', () => {
    renderAt('/history');

    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });

  it('does not keep Inicio active on a nested route', () => {
    renderAt('/workout');

    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Entrenar' })).toHaveAttribute('aria-current', 'page');
  });

  it('gives the active destination a cue that survives greyscale', () => {
    renderAt('/history');

    const indicatorOf = (label: string) => {
      const link = screen.getByRole('link', { name: label });
      const indicator = link.querySelector('span[aria-hidden="true"]');

      return indicator?.className ?? '';
    };

    // Colour alone is not perceivable for every user, so the active tab also
    // carries a bar whose visibility does not depend on hue.
    expect(indicatorOf('Historial')).toContain('opacity-100');
    expect(indicatorOf('Inicio')).toContain('opacity-0');
  });
});
