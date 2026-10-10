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
      className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-bg/85"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-md py-2.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-primary-soft' : 'text-muted hover:text-text'
                }`
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
