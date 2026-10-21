import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { AuthCard } from '../components/auth/AuthCard.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';
import type { ForgotPasswordValues } from '../schemas/auth.ts';
import { forgotPasswordSchema } from '../schemas/auth.ts';

/**
 * "I forgot my password" screen: it only asks for the address and requests the
 * recovery email.
 *
 * The confirmation never says whether the account exists — Supabase answers the
 * same either way so the screen cannot be used to enumerate registered emails.
 */
export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await sendPasswordReset(values.email);
      setSentTo(values.email);
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  if (sentTo) {
    return (
      <AuthCard
        title="Revisá tu correo"
        subtitle={`Si ${sentTo} tiene cuenta, le mandamos un link para elegir una contraseña nueva.`}
        footer={
          // The only way out of the confirmation, so it has to read as one: `link-ruled` is the shared
          // underline declared in `src/index.css`, at 4.83:1 where the pale separator rule it replaced
          // measured 1.30:1.
          <Link to="/login" className="text-text link-ruled">
            Volver a entrar
          </Link>
        }
      >
        <p className="text-muted text-sm">
          El link vence, así que conviene usarlo pronto. Si no llega, mirá en la carpeta de spam.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Recuperar contraseña"
      subtitle="Te mandamos un link para elegir una contraseña nueva."
      footer={
        <Link to="/login" className="text-text link-ruled">
          Volver a entrar
        </Link>
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
        {formError ? (
          <p role="alert" className="text-danger text-sm">
            {formError}
          </p>
        ) : null}
        <Button type="submit" pending={formState.isSubmitting} className="w-full">
          {formState.isSubmitting ? 'Mandando…' : 'Mandarme el link'}
        </Button>
      </form>
    </AuthCard>
  );
}
