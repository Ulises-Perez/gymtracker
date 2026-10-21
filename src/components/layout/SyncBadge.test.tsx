import { MutationObserver, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../lib/queryClient.ts';
import { SAVE_WORKOUT_MUTATION_KEY } from '../../lib/queued-mutations.ts';
import type { QueuedMutationVariables } from '../../lib/queued-mutations.ts';
import { getSupabase } from '../../lib/supabase.ts';
import { createFakeSupabase } from '../../testing/fake-supabase.ts';
import { queuedSaveWorkout } from '../../testing/workout-fixtures.ts';
import { AppShell } from './AppShell.tsx';
import { SyncBadge } from './SyncBadge.tsx';

vi.mock('../../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Queues a write that cannot go anywhere yet.
 *
 * The client goes offline rather than the RPC being stubbed, because that is what the badge
 * is about: a write the browser is holding, which is not the same thing as a write that
 * failed. `retry` is deliberately left alone — the default is what lets an offline write
 * pause instead of failing outright.
 */
function queueOfflineSave() {
  // The type arguments are not decoration: left to the defaults, `TVariables` is `void` and
  // the payload cannot be passed at all.
  const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(client, {
    mutationKey: SAVE_WORKOUT_MUTATION_KEY,
    retryDelay: 0,
  });

  void observer.mutate(queuedSaveWorkout())?.catch(() => undefined);
}

/*
 * The three tokens this badge's contrast is about, as `src/index.css` declares them, and the ratio
 * computed the way WCAG says. Read by hand because jsdom has no stylesheet here: what is under test
 * is *which* token the sentence is written in, and the number each one measures is the whole reason
 * the choice is not free.
 */
const INK = '#16171b';
const SURFACE = '#e9e7e1';
const MUTED = '#6b6a66';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrastRatio(a: string, b: string): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));

  return (lighter + 0.05) / (darker + 0.05);
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  client = createQueryClient();
  onlineManager.setOnline(false);
});

afterEach(() => {
  // Balanced by hand: `QueryClient.unmount()` decrements a mount count and a stray one
  // leaves it negative, after which every later `mount()` returns early and the queue stops
  // resuming. Only the test that mounted calls it.
  client.clear();
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

describe('SyncBadge', () => {
  it('says nothing while everything is on the server', () => {
    render(<SyncBadge />, { wrapper });

    // Silence is the point: a permanent badge that says "all good" is noise the user learns
    // to stop reading.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says that a workout is still waiting to be synced', async () => {
    render(<SyncBadge />, { wrapper });

    queueOfflineSave();

    expect(await screen.findByText('1 entrenamiento pendiente de sincronizar')).toBeInTheDocument();
  });

  it('counts what is waiting', async () => {
    render(<SyncBadge />, { wrapper });

    queueOfflineSave();
    queueOfflineSave();

    expect(
      await screen.findByText('2 entrenamientos pendientes de sincronizar'),
    ).toBeInTheDocument();
  });

  /**
   * S1: the sentence is the only sign in the whole app that a session is still on its way, so it has
   * to be readable. On the surface it sits on, `muted` measures 4.38:1 -- under the 4.5:1 AA asks of
   * normal text -- and ink measures 14.48:1.
   */
  it('writes in ink, which clears AA on its own surface, and not in muted, which does not', async () => {
    render(<SyncBadge />, { wrapper });

    queueOfflineSave();

    const badge = await screen.findByRole('status');

    expect(contrastRatio(INK, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(MUTED, SURFACE)).toBeLessThan(4.5);

    expect(badge).toHaveClass('text-text', 'bg-surface', 'border-rule', 'rounded-sm');
    expect(badge).not.toHaveClass('text-muted');
    // The world has no shadow and no gradient, the blur belongs to the nav and the overlay, and the
    // only radius a control may carry is `rounded-sm`.
    expect(badge.className).not.toMatch(/shadow|gradient|backdrop|rounded-(?:md|lg|full|none)/);
  });

  it('goes quiet again once the write lands', async () => {
    fake.rpc.mockResolvedValue({
      data: { workout_id: queuedSaveWorkout().payload.id, new_prs: [] },
      error: null,
    });

    render(<SyncBadge />, { wrapper });

    queueOfflineSave();
    await screen.findByRole('status');

    /*
     * The connection coming back is the whole point of the badge: the queue drains and the
     * user stops needing to know about it. `mount()` before going online and not after, because
     * `mount` only resumes paused writes from inside its online subscription and that
     * subscription does not fire on subscribing (defect D1).
     */
    client.mount();
    onlineManager.setOnline(true);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    client.unmount();
  });

  /**
   * S1, and the defect in the shape it was measured in: rendered between `<main>` and the fixed nav,
   * the badge was laid out at the bottom of the column, where the nav paints -- it measured y 694→732
   * against a nav at y 678.5 at 360×740, so it was behind it on every screen.
   *
   * jsdom has no layout, so the box cannot be measured again here; what is asserted is the rule that
   * decided it. Anchored to the viewport one nav-height up, the badge is visible with any amount of
   * content under it, and the 7rem the content column reserves below its last line (4rem of offset
   * plus the badge's own height) is what keeps it off the content.
   */
  it('is pinned above the fixed nav instead of being laid out at the end of the page', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<p>Contenido</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { wrapper },
    );

    queueOfflineSave();

    const badge = await screen.findByRole('status');
    const anchor = badge.parentElement?.parentElement;

    /*
     * The badge sits on the top edge of the band that carries the nav, and it is anchored to that
     * edge rather than to a distance from the bottom of the viewport: the nav is 61.5px tall at the
     * default font size and grows when the person enlarges the text, so an offset written in rems
     * covers the badge the day the text is bigger. `bottom-full` is the band's own top edge, so the
     * distance is the nav's whatever the nav measures.
     */
    expect(anchor?.className).toContain('absolute');
    expect(anchor?.className).toContain('bottom-full');
    expect(anchor?.parentElement?.className).toContain('fixed');
    expect(anchor?.parentElement?.className).toContain('bottom-0');
    // The band that holds the nav and the badge is the same one, so the badge cannot end up
    // under the nav: it is the nav's own top edge.
    expect(anchor?.parentElement?.querySelector('nav')).not.toBeNull();
    // And it is not inside the navigation landmark: a live region belongs to the page, not to the
    // menu.
    expect(badge.closest('nav')).toBeNull();
    expect(badge.closest('main')).toBeNull();
  });

  /**
   * A write that ran out of retries is not in the queue any more, so the badge has nothing to
   * say about it. That is not a gap: the screen that owns the draft is the one that knows the
   * workout did not save, and it is the one that offers the retry. This badge answers only
   * "is anything still on its way".
   */
  it('says nothing about a write that already failed out of the queue', async () => {
    render(<SyncBadge />, { wrapper });

    onlineManager.setOnline(true);
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const observer = new MutationObserver<unknown, Error, QueuedMutationVariables>(client, {
      mutationKey: SAVE_WORKOUT_MUTATION_KEY,
      retry: false,
    });

    void observer.mutate(queuedSaveWorkout())?.catch(() => undefined);

    await waitFor(() => {
      expect(client.getMutationCache().getAll()[0]?.state.status).toBe('error');
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
