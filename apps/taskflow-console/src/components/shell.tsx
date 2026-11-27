import { NotificationCenter } from '@notifyhub/mfe-runtime';
import { NOTIFYHUB_URL, ROLE_LABEL } from '@taskflow/kit';
import { Boxes, FolderKanban, LogOut, Network, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSessionEffects } from '../lib/server-notifications';
import { signOut, useSession } from '../lib/session-store';
import { AuthGate } from './auth-gate';

const NAV = [
  { href: '/', label: 'Proyectos', icon: FolderKanban },
  { href: '/equipo', label: 'Equipo y sesión', icon: Users },
  { href: '/arquitectura', label: 'Arquitectura', icon: Network },
] as const;

const TITLE: Record<string, string> = {
  '/': 'Proyectos y tareas',
  '/equipo': 'Equipo y sesión',
  '/arquitectura': 'Arquitectura del sistema',
};

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const session = useSession();
  useSessionEffects();

  // La página de arquitectura es pública (solo lee la salud del gateway): se puede mostrar sin entrar.
  if (!session && path !== '/arquitectura') return <AuthGate />;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <a href="/" className="mb-6 flex items-center gap-2.5 px-2 pt-1 text-white">
          <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-base font-black text-sidebar-primary-foreground">
            T
          </span>
          <span className="text-lg font-black tracking-tight">TaskFlow</span>
        </a>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              aria-current={path === href ? 'page' : undefined}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-sidebar-accent hover:text-white aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-white"
            >
              <Icon className="size-4" /> {label}
            </a>
          ))}
        </nav>
        <a
          href={NOTIFYHUB_URL}
          className="mb-3 flex items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs hover:bg-sidebar-accent hover:text-white"
        >
          <Boxes className="size-3.5" /> Ver NotifyHub (versión 1, modular)
        </a>
        {session && (
          <div className="rounded-xl bg-sidebar-accent p-3 text-sm">
            <p className="truncate font-semibold text-white">{session.user.name}</p>
            <p className="truncate text-xs">{ROLE_LABEL[session.user.role]}</p>
            <button
              onClick={() => void signOut()}
              className="mt-2 flex items-center gap-1.5 text-xs text-sidebar-primary hover:underline"
            >
              <LogOut className="size-3.5" /> Cerrar sesión
            </button>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/90 px-5 backdrop-blur">
          <h1 className="text-base font-bold">{TITLE[path] ?? 'TaskFlow'}</h1>
          <nav className="ml-2 flex gap-1 md:hidden" aria-label="Secciones">
            {NAV.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                aria-current={path === href ? 'page' : undefined}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">{session && <NotificationCenter />}</div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
