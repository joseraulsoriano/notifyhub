import { ApiError } from '@taskflow/kit';
import { Button } from '@notifyhub/mfe-runtime/ui/button';
import { Input } from '@notifyhub/mfe-runtime/ui/input';
import { Label } from '@notifyhub/mfe-runtime/ui/label';
import { useState, type FormEvent } from 'react';
import { register, signIn } from '../lib/session-store';

export function AuthGate() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await signIn(email, password);
      else await register(String(form.get('name') ?? '').trim(), email, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(60rem_30rem_at_20%_-10%,#c7d2fe,transparent),radial-gradient(50rem_30rem_at_100%_110%,#e0e7ff,transparent)] p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">T</span>
          <div>
            <p className="text-lg font-black leading-none">TaskFlow</p>
            <p className="mt-1 text-xs text-muted-foreground">Proyectos y tareas en equipo</p>
          </div>
        </div>
        <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-medium">
          {(['login', 'register'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => (setMode(value), setError(null))}
              className={`rounded-md py-1.5 transition ${mode === value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {value === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3.5">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" required minLength={2} autoComplete="name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "register" ? 10 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>}
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta y entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
