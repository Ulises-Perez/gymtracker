import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../lib/queryClient.ts';
import { getSupabase } from '../lib/supabase.ts';
import { createFakeSupabase } from '../testing/fake-supabase.ts';
import { ExerciseDetailPage } from './ExerciseDetailPage.tsx';

vi.mock('../lib/supabase.ts', () => ({ getSupabase: vi.fn() }));

vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-a000-000000000001' } }),
}));

/*
 * The chart itself is replaced, and that is the honest boundary: uPlot draws into a canvas and jsdom
 * has none, so the real one cannot be rendered here at all. What is under test is the wiring around
 * it — the name, the metric buttons, the states — while the drawing and the axis formatting are
 * exercised by the browser. The stub reports which metric it was handed, which is the part of the
 * contract the page owns.
 */
vi.mock('../components/history/ProgressChart.tsx', () => ({
  /*
   * The stub reports the two props the page hands over, and not only the metric. Ignoring them was
   * the problem: a page handing it `[]`, a stale array or `undefined` all looked the same from here.
   */
  ProgressChart: ({
    metric,
    label,
    points,
  }: {
    metric: string;
    label: string;
    points: unknown;
  }) => (
    <p data-testid="grafica" data-label={label} data-points={JSON.stringify(points)}>
      {metric}
    </p>
  ),
}));

const EXERCISE_ID = '01920000-0000-7000-8000-0000000000a1';

let fake: ReturnType<typeof createFakeSupabase>;
let client: ReturnType<typeof createQueryClient>;

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/history/exercise/${EXERCISE_ID}`]}>
        <Routes>
          <Route path="/history/exercise/:exerciseId" element={<ExerciseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fake = createFakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);

  fake.rpc.mockResolvedValue({
    data: [
      {
        workout_date: '2026-10-13',
        max_weight: '70.00',
        total_volume: '1750.00',
        best_set_1rm: '81.67',
        total_sets: 3,
      },
    ],
    error: null,
  });
  fake.setTableResult('exercises', {
    data: [{ id: EXERCISE_ID, name: 'Press Banca', muscle_group_id: 'mg-pecho', is_custom: false }],
    error: null,
  });
  fake.setTableResult('muscle_groups', {
    data: [{ id: 'mg-pecho', name: 'Pecho', icon: null }],
    error: null,
  });

  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
});

describe('ExerciseDetailPage', () => {
  it('names the exercise from the catalogue and graphs its progress', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Press Banca' })).toBeInTheDocument();
    expect(await screen.findByTestId('grafica')).toHaveTextContent('maxWeight');
  });

  it('hands the chart the points the RPC brought, and the label to plot them as', async () => {
    renderPage();

    const chart = await screen.findByTestId('grafica');

    /*
     * The stub used to ignore `points` and `label`, so a page handing it `[]`, a stale array or
     * `undefined` all looked the same from here. They are reported now, and this asserts they are
     * exactly what `exercise_progress` returned after the boundary turned the decimals into numbers.
     */
    expect(JSON.parse(chart.getAttribute('data-points') ?? 'null')).toEqual([
      { date: '2026-10-13', maxWeight: 70, volume: 1750, oneRm: 81.67, sets: 3 },
    ]);
    expect(chart).toHaveAttribute('data-label', 'kg');
  });

  it('starts on the max weight and changes metric when asked', async () => {
    renderPage();
    await screen.findByTestId('grafica');

    // The heaviest set is what someone opens this screen to see; the other two are a tap away.
    expect(screen.getByRole('button', { name: 'Peso máximo', pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Volumen' }));

    expect(await screen.findByTestId('grafica')).toHaveTextContent('volume');
  });

  it('says so when the exercise has never been trained, instead of drawing nothing', async () => {
    fake.rpc.mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(
      await screen.findByText(
        'Todavía no hay series de este ejercicio. Se grafica a partir de la primera que guardes.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('grafica')).not.toBeInTheDocument();
  });

  it('reports a failed read in Spanish instead of an empty chart', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el progreso');
  });
});
