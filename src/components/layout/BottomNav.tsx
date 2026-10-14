import { NavLink } from 'react-router';
import { HistoryIcon, HomeIcon, ProfileIcon, WorkoutIcon } from '../icons.tsx';

const items = [
  // `end` keeps Inicio from staying active on every nested route.
  { to: '/', label: 'Inicio', Icon: HomeIcon, end: true },
  { to: '/workout', label: 'Entrenar', Icon: WorkoutIcon, end: false },
  { to: '/history', label: 'Historial', Icon: HistoryIcon, end: false },
  { to: '/profile', label: 'Perfil', Icon: ProfileIcon, end: false },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="bottom-nav border-rule bg-bg/85 fixed inset-x-0 bottom-0 z-40 border-t"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-1 rounded-sm py-2.5 text-[11px] font-medium transition-colors motion-reduce:transition-none ${
                  // Ink for where you are, muted for the rest, and the accent stays out of it: the
                  // red is for what was replaced and for what can be pressed, and the current tab is
                  // a state, not a press.
                  isActive ? 'text-text' : 'text-muted hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/*
                   * The active tab must not be signalled by colour alone: that
                   * cue disappears in greyscale and for colour-blind users. The
                   * bar carries the same information without any colour.
                   */}
                  <span
                    aria-hidden="true"
                    className={`bg-text absolute inset-x-3 top-0 h-0.5 rounded-full transition-opacity motion-reduce:transition-none ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <Icon className="size-5" />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
