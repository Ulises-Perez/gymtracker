import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';

import { AuthCard } from '../components/auth/AuthCard.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';
import type { ResetPasswordValues } from '../schemas/auth.ts';
import { resetPasswordSchema } from '../schemas/auth.ts';

/**
 * Sets a new password for the session the recovery link brought.
 *
 * Landing here without a session means the link was already used or expired, so
 * the screen sends the visitor back to ask for a fresh one instead of showing a
 * form whose submit could only fail.
 */
export function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await updatePassword(values.password);
      void navigate('/', { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  });

  if (loading) {
    return <PageSkeleton label="Preparando el formulario…" />;
  }

  if (!session) {
    return <Navigate to="/forgot-password" replace />;
  }

  return (
    <AuthCard title="Nueva contraseña" subtitle="Elegí una contraseña que no uses en otro lado.">
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Input
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Repetí la contraseña nueva"
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
          {formState.isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthCard>
  );
}
