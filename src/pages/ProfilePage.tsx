import { Suspense, lazy, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { ProfileIcon } from '../components/icons.tsx';
import { Skeleton } from '../components/ui/Skeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useExportWorkouts } from '../hooks/useExportWorkouts.ts';
import {
  useBodyWeights,
  useProfile,
  useSaveBodyWeight,
  useUpdateFullName,
  useUpdateWeightUnit,
  useUploadAvatar,
} from '../hooks/useProfile.ts';
import { useProfileStats } from '../hooks/useProfileStats.ts';
import { validateAvatarFile } from '../lib/avatar-api.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';
import { toStoredKg } from '../lib/units.ts';
import type { WeightUnit } from '../lib/units.ts';
import { localIsoDate, parseDecimalInput } from '../lib/utils.ts';

/**
 * The body-weight chart, on demand.
 *
 * Behind its own `import()` so uPlot and its stylesheet stay out of both the initial bundle and this
 * page's own chunk, which is what the 180 kB budget requires (S11). The fallback is a skeleton of the
 * same height, so the page does not jump when the canvas arrives.
 */
const BodyWeightChart = lazy(async () => {
  const { BodyWeightChart: Chart } = await import('../components/profile/BodyWeightChart.tsx');

  return { default: Chart };
});

/** The two units, in the order the notebook would write them. */
const UNITS: WeightUnit[] = ['kg', 'lb'];

/** The copy for an upload that reached storage and came back refused. */
const AVATAR_UPLOAD_ERROR = 'No pudimos subir la foto. Probá de nuevo.';

/**
 * The avatar, or the shape that stands in for it.
 *
 * The replacement is not an empty frame. A circle carrying the initials of the name is a face the page
 * can wear before anyone uploads one, and it costs no request and no third-party icon; with no name to
 * initial, it falls back to the person glyph the navigation bar already uses. It is marked
 * `aria-hidden` on purpose: the name sits in the field right above, so announcing a decorative circle
 * would be noise rather than information.
 */
function Avatar({ name, url }: { name: string | null; url: string | null }) {
  if (url !== null) {
    return (
      <img
        src={url}
        alt="Foto de perfil"
        className="border-rule h-20 w-20 shrink-0 rounded-full border object-cover"
      />
    );
  }

  const letters = initials(name);

  return (
    <div
      data-testid="avatar-placeholder"
      aria-hidden="true"
      className="border-rule text-muted font-display flex h-20 w-20 shrink-0 items-center justify-center rounded-full border text-2xl font-black"
    >
      {letters === '' ? <ProfileIcon className="size-8" /> : letters}
    </div>
  );
}

/**
 * At most two letters, from the first two words of the name.
 *
 * A name is whatever the user typed: spaces, surnames, a single word. Joining the first two words and
 * taking their first letters turns "Ulises Fernández" into `UF` without needing to know which part is
 * the given name, and an empty answer is the caller's cue to draw the glyph instead.
 */
function initials(name: string | null): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function ProfilePage() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useProfile(user?.id ?? '');
  const updateUnit = useUpdateWeightUnit(user?.id ?? '');
  const updateName = useUpdateFullName(user?.id ?? '');
  const uploadAvatar = useUploadAvatar(user?.id ?? '');
  const exportWorkouts = useExportWorkouts(user?.id ?? '');
  const stats = useProfileStats(user?.id ?? '');
  const bodyWeights = useBodyWeights(user?.id ?? '');
  const saveWeight = useSaveBodyWeight(user?.id ?? '');
  const [weightInput, setWeightInput] = useState('');
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // The selector shows what the profile stores, with kilos while it is on its way: the app stores
  // kilos, so that is the honest default rather than a blank state.
  const unit = profile.data?.weightUnit ?? 'kg';
  const weightPoints = bodyWeights.data ?? [];

  /**
   * Logs today's weight.
   *
   * The typed value is in the preferred unit and the column is kilos, so it goes through
   * `toStoredKg` on the way in — the same edge the reading screens convert on, in the other
   * direction. A half-typed or empty field is not a weight and writes nothing.
   */
  const onSaveWeight = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const typed = parseDecimalInput(weightInput);

    if (typed === null) {
      return;
    }

    saveWeight.mutate(
      { date: localIsoDate(), weightKg: toStoredKg(typed, unit) },
      { onSuccess: () => setWeightInput('') },
    );
  };

  /**
   * Saves the name.
   *
   * The field is uncontrolled and read from the form, for the same reason the set card's fields are:
   * one controlled input would rewrite what the user is typing on every keystroke. What it writes is
   * `full_name`, the column the sign-up trigger fills, so there is no second name to keep in sync.
   */
  const onSaveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const typed = new FormData(event.currentTarget).get('fullName');

    updateName.mutate(typeof typed === 'string' ? typed : '');
  };

  /**
   * Takes the chosen file, or refuses it before anything is uploaded.
   *
   * The input is cleared afterwards so that choosing the same file again still fires a change: after a
   * refusal or a failed upload, the next attempt is usually the very same file. `accept` on the input
   * is a hint to the picker and not a gate, which is why the file is validated here as well.
   */
  const onPickAvatar = (event: FormEvent<HTMLInputElement>) => {
    const items = event.currentTarget.files;
    const file = items?.[0] ?? null;

    event.currentTarget.value = '';
    setAvatarError(null);

    if (file === null) {
      return;
    }

    const problem = validateAvatarFile(file);

    if (problem !== null) {
      setAvatarError(problem);
      return;
    }

    uploadAvatar.mutate(file, { onError: () => setAvatarError(AVATAR_UPLOAD_ERROR) });
  };

  const onSignOut = async () => {
    setError(null);
    setPending(true);

    try {
      await signOut();
      // The gate would also send the user to /login once the session clears, but
      // navigating here is what makes the outcome immediate and testable.
      void navigate('/login', { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught));
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/*
       * The heading names the screen, the way "Historial" names its own, and it is also the `h1` the UI
       * audit measures on every route. What used to sit here announced the phase that would fill the
       * screen; the screen is now filled, so that sentence is gone with it.
       */}
      <h1 className="font-display text-3xl font-black tracking-tight">Perfil</h1>

      {/*
       * The name and the photo, in one section, because they answer one question: which account this
       * is. The name is an uncontrolled field read from the form on submit — a controlled one would
       * rewrite the name mid-keystroke — and `key` keeps it showing what is stored: when the profile
       * read settles, or the name is saved and refetched, the field remounts around the stored value
       * instead of keeping whatever the input happened to hold.
       */}
      <section className="border-text border-t-2 pt-4">
        <h2 className="font-display text-lg font-extrabold tracking-tight">Nombre y foto</h2>
        <p className="text-muted mt-1 text-sm">
          El nombre con el que creaste la cuenta, y la foto que se ve en tu perfil.
        </p>

        <div className="mt-3 flex items-center gap-4">
          <Avatar name={profile.data?.fullName ?? null} url={profile.data?.avatarUrl ?? null} />
          <div className="flex-1">
            {/*
             * The hint is outside the label on purpose: inside it, it would become part of the
             * input's accessible name -- "Nueva foto de perfil PNG, JPG o WebP, hasta 2 MB" -- and a
             * field whose name is a sentence is not a field a screen reader can announce.
             */}
            <label className="text-muted block text-sm">
              Nueva foto de perfil
              <input
                type="file"
                // A hint to the picker, never the gate: the same three types are checked on the file
                // itself, because `accept` filters a dialog and stops nothing else.
                accept="image/png,image/jpeg,image/webp"
                onChange={onPickAvatar}
                disabled={uploadAvatar.isPending}
                aria-busy={uploadAvatar.isPending || undefined}
                className="border-rule text-text file:bg-surface file:text-text mt-1 min-h-12 w-full rounded-sm border px-3 py-3 text-sm disabled:opacity-50"
              />
            </label>
            <span className="text-muted mt-1 block text-xs">PNG, JPG o WebP, hasta 2 MB.</span>
          </div>
        </div>

        {uploadAvatar.isPending ? (
          <p role="status" className="text-muted mt-2 text-sm">
            Subiendo la foto…
          </p>
        ) : null}

        {avatarError !== null ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            {avatarError}
          </p>
        ) : null}

        <form onSubmit={onSaveName} className="mt-3 flex items-end gap-2">
          <label className="text-muted flex-1 text-sm">
            Nombre
            <input
              type="text"
              name="fullName"
              key={profile.data?.fullName ?? ''}
              defaultValue={profile.data?.fullName ?? ''}
              className="border-rule text-text placeholder:text-muted mt-1 min-h-12 w-full rounded-sm border px-3"
            />
          </label>
          <button
            type="submit"
            disabled={updateName.isPending}
            aria-busy={updateName.isPending || undefined}
            className="border-rule hover:bg-surface min-h-12 rounded-sm border px-4 disabled:opacity-50"
          >
            {updateName.isPending ? 'Guardando…' : 'Guardar nombre'}
          </button>
        </form>

        {updateName.isError ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            No pudimos guardar el nombre. Probá de nuevo.
          </p>
        ) : null}
      </section>

      {/*
       * The unit preference. It changes what reading screens show and nothing that is stored, so the
       * copy says so out loud.
       *
       * The chips follow `GroupChip`: a ruled border, a control's radius, no per-control focus ring
       * (focus is declared once in `index.css`), and `aria-pressed` so the state does not depend on
       * colour. The selected chip is ink and not accent -- which unit is chosen is a state, and the
       * red belongs to what was replaced and to what advances the session.
       */}
      <section className="border-text border-t-2 pt-4">
        <h2 className="font-display text-lg font-extrabold tracking-tight">Unidad de peso</h2>
        <p className="text-muted mt-1 text-sm">
          Cómo se leen los pesos en las pantallas. Se guardan siempre en kilos.
        </p>

        <div role="group" aria-label="Unidad de peso" className="mt-2 flex flex-wrap gap-2">
          {UNITS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={unit === option}
              disabled={updateUnit.isPending}
              onClick={() => updateUnit.mutate(option)}
              className={`border-rule min-h-12 rounded-sm border px-3 text-sm transition-colors motion-reduce:transition-none disabled:opacity-50 ${
                unit === option ? 'bg-text border-text text-bg' : 'text-muted hover:text-text'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {updateUnit.isError ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            No pudimos guardar la unidad. Probá de nuevo.
          </p>
        ) : null}
      </section>

      {/*
       * The derived figures. None of them is a stored column: the phase asks for them derived from
       * the reads that already answer them, so `totalWorkouts` comes from the dashboard summary and
       * the other two from a read of their own. While a read is on its way the figure is a dash, which
       * is honest about not knowing yet instead of showing a zero the user never earned.
       */}
      <section className="border-text border-t-2 pt-4">
        <h2 className="font-display text-lg font-extrabold tracking-tight">Estadísticas</h2>
        <p className="text-muted mt-1 text-sm">Lo que ya entrenaste, contado desde tus datos.</p>

        <dl data-testid="estadisticas" className="tabular mt-3 grid grid-cols-3 gap-2">
          <div>
            <dt className="text-muted text-xs">Entrenamientos</dt>
            <dd className="font-display text-2xl font-black">{stats.totalWorkouts ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">Mejor racha</dt>
            <dd className="font-display text-2xl font-black">{stats.bestStreak ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">Récords</dt>
            <dd className="font-display text-2xl font-black">{stats.totalPrs ?? '—'}</dd>
          </div>
        </dl>

        {stats.isError ? (
          // Deliberately not `role="alert"`: a failed figure is worth saying and not worth taking the
          // screen's one announcement away from an action that failed.
          <p className="text-muted mt-2 text-sm">No pudimos cargar las estadísticas.</p>
        ) : null}
      </section>

      {/*
       * The body weight: one measurement per day, read in the preferred unit and stored in kilos. The
       * copy says the two things that are not obvious on screen — the unit the file of your body is
       * kept in, and that logging today twice replaces today's entry rather than failing.
       */}
      <section className="border-text border-t-2 pt-4">
        <h2 className="font-display text-lg font-extrabold tracking-tight">Peso corporal</h2>
        <p className="text-muted mt-1 text-sm">Se guarda siempre en kilos; acá se lee en {unit}.</p>

        <form onSubmit={onSaveWeight} className="mt-2 flex items-end gap-2">
          <label className="text-muted flex-1 text-sm">
            Peso de hoy
            <input
              type="text"
              inputMode="decimal"
              // The label names the unit, so a bare number is never ambiguous.
              aria-label={`Peso corporal en ${unit}`}
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
              className="border-rule text-text placeholder:text-muted mt-1 min-h-12 w-full rounded-sm border px-3"
            />
          </label>
          <button
            type="submit"
            disabled={saveWeight.isPending || weightInput.trim() === ''}
            aria-busy={saveWeight.isPending || undefined}
            className="border-rule hover:bg-surface min-h-12 rounded-sm border px-4 disabled:opacity-50"
          >
            {saveWeight.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </form>

        <p className="text-muted mt-1 text-xs">Si ya cargaste el peso de hoy, se actualiza.</p>

        {saveWeight.isError ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            No pudimos guardar el peso. Probá de nuevo.
          </p>
        ) : null}

        {weightPoints.length > 0 ? (
          <Suspense fallback={<Skeleton className="mt-3 h-[160px] w-full" />}>
            {/* The label is the unit itself, so the axis legend cannot disagree with the plotted
                values: `buildBodyWeightSeries` converts the stored kilos to it. */}
            <BodyWeightChart points={weightPoints} label={unit} />
          </Suspense>
        ) : (
          <p className="text-muted mt-2 text-sm">
            Todavía no registraste tu peso. Se grafica a partir del primero que guardes.
          </p>
        )}
      </section>
      {/*
       * The export: it reads the whole history and hands it over as a file. It is a **secondary**
       * action -- it does not advance or confirm a workout -- so it is a ruled control with no
       * accent, the same shape as "Salir": a rule border, a control's radius, and no focus ring of
       * its own because focus is declared once in `index.css`.
       *
       * The pending state follows what this screen already does: the label is the indicator and the
       * control disables and announces `aria-busy`, instead of the spinner the plan forbids. The copy
       * says the one thing about the file that is not obvious on screen: the weights inside it are
       * kilos even while this screen reads them in the preferred unit, because the file is data.
       */}
      <section className="border-text border-t-2 pt-4">
        <h2 className="font-display text-lg font-extrabold tracking-tight">Exportar</h2>
        <p className="text-muted mt-1 text-sm">
          Descarga todo tu historial en un CSV. Los pesos van en kilos, como se guardan.
        </p>

        <button
          type="button"
          onClick={() => void exportWorkouts.exportWorkouts()}
          disabled={exportWorkouts.pending}
          aria-busy={exportWorkouts.pending || undefined}
          className="border-rule hover:bg-surface mt-2 min-h-12 w-full rounded-sm border px-4 disabled:opacity-50"
        >
          {exportWorkouts.pending ? 'Exportando…' : 'Exportar CSV'}
        </button>

        {exportWorkouts.error ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            {exportWorkouts.error}
          </p>
        ) : null}
      </section>

      {/*
       * Logging out is the one profile action the phase 2 definition of done names, so it lands
       * here now instead of waiting for the rest of phase 6. It leaves for the login screen rather
       * than advancing the session or replacing anything, so it is a ruled control and the accent
       * stays out of it -- a button that paints no ring of its own either, because focus is declared
       * once in `index.css`.
       */}
      <div className="border-rule space-y-2 border-t pt-6">
        <button
          type="button"
          onClick={() => void onSignOut()}
          disabled={pending}
          aria-busy={pending || undefined}
          className="border-rule hover:bg-surface min-h-12 w-full rounded-sm border px-4 disabled:opacity-50"
        >
          {pending ? 'Saliendo…' : 'Salir'}
        </button>
        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
