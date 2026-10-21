import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';

import { AuthCard } from '../components/auth/AuthCard.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';
import type { RegisterValues } from '../schemas/auth.ts';
import { registerSchema } from '../schemas/auth.ts';

/**
 * Registration screen.
 *
 * It asks for the name because the database trigger that creates the profile
 * reads it from the sign-up metadata: there is no profile to update afterwards,
 * and a nameless profile would stay nameless until the user edits it.
 *
 * Both outcomes are handled: when the project requires email confirmation the
 * sign-up returns no session and the screen becomes a "check your inbox"
 * screen; when it signs in directly, the visitor goes into the app.
 */
export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [askedToConfirm, setAskedToConfirm] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const { session } = await signUp(values.email, values.password, values.fullName);

      if (session) {
        void navigate(from, { replace: true });

        return;
      }

      setAskedToConfirm(values.email);
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  if (askedToConfirm) {
    return (
      <AuthCard
        title="Revisá tu correo"
        subtitle={`Te mandamos un link a ${askedToConfirm} para confirmar la cuenta.`}
        footer={
          // The only way out of the confirmation screen, so it has to read as one: `link-ruled` is the
          // shared underline declared in `src/index.css`, because the pale separator rule under it
          // measured 1.30:1 where WCAG asks 3:1.
          <Link to="/login" className="text-text link-ruled">
            Volver a entrar
          </Link>
        }
      >
        <p className="text-sm">Cuando lo confirmes, entrá con tu email y tu contraseña.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Crear cuenta"
      subtitle="Un email, una contraseña y listo."
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          {/* Ink and the printed rule, like every link that only navigates: the soft red is a ground
              tint, and a tint used as a text colour is wrong on paper. The rule is `link-ruled`,
              declared once in `src/index.css` and not copied from screen to screen. */}
          <Link to="/login" className="text-text link-ruled">
            Entrá
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Input
          label="Nombre"
          autoComplete="name"
          error={formState.errors.fullName?.message}
          {...register('fullName')}
        />
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
          autoComplete="new-password"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Repetí la contraseña"
          type="password"
          autoComplete="new-password"
          error={formState.errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        {formError ? (
          <p role="alert" className="text-danger text-sm">
            {formError}
          </p>
        ) : null}
        <Button type="submit" pending={formState.isSubmitting} className="w-full">
          {formState.isSubmitting ? 'Creando…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthCard>
  );
}
