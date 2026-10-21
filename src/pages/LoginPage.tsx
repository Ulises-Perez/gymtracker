import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';

import { AuthCard } from '../components/auth/AuthCard.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';
import type { LoginValues } from '../schemas/auth.ts';
import { loginSchema } from '../schemas/auth.ts';

/**
 * Login screen.
 *
 * Zod and React Hook Form are imported by this route's own chunk, which is what
 * keeps them out of the initial bundle (A8): the first paint never shows a form.
 */
export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // Where the visitor was headed before the gate stopped them: `RequireAuth`
  // puts it in the state, so logging in resumes that intent instead of dumping
  // everyone on the dashboard.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await signIn(values.email, values.password);
      void navigate(from, { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  return (
    <AuthCard
      title="Entrar"
      subtitle="Registrá tus entrenamientos, incluso sin señal."
      footer={
        <>
          ¿No tenés cuenta?{' '}
          {/* A link that only navigates: ink with the printed rule under it. The soft red is a ground
              tint used as a text colour, which on paper reads as an error rather than a link. The rule
              is `link-ruled`, declared once in `src/index.css`: the pale separator rule under it
              measured 1.30:1, and WCAG asks 3:1 of a graphic that means something. */}
          <Link to="/register" state={{ from }} className="text-text link-ruled">
            Creá una
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        {formError ? (
          <p role="alert" className="text-danger text-sm">
            {formError}
          </p>
        ) : null}
        <Button type="submit" pending={formState.isSubmitting} className="w-full">
          {formState.isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-text link-ruled">
            Olvidé mi contraseña
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
