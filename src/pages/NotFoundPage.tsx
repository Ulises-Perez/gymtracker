import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Pantalla no encontrada</h1>
      <p className="text-muted text-sm">La ruta que pediste no existe.</p>
      <Link
        to="/"
        className="inline-flex rounded-md bg-gradient-to-r from-primary to-primary-soft px-4 py-2 text-sm font-medium text-bg"
      >
        Volver al inicio
      </Link>
    </section>
  );
}
