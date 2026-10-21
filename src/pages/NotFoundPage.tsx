import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="space-y-3">
      {/* The display face at its own weight, like every page title in this world, and no label above
          it. The words stay exactly as they were: the route fallback identifies this screen by this
          heading. */}
      <h1 className="font-display text-3xl font-black tracking-tight">Pantalla no encontrada</h1>
      <p className="text-muted text-sm">La ruta que pediste no existe.</p>
      {/* It only navigates, so it is ink with the printed rule under it: the gradient from the old
          world is gone, and the soft red it landed on is a ground tint, not a text colour. The rule is
          `link-ruled`, declared once in `src/index.css`: the pale separator rule under it measured
          1.30:1, and a link nobody can locate is not a way home. */}
      <Link to="/" className="text-text link-ruled">
        Volver al inicio
      </Link>
    </section>
  );
}
