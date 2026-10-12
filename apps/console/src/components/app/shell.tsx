import { Command, Search } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { AppSidebar } from './app-sidebar';
import { ConnectionButton } from './connection-dialog';

const CRUMB: Record<string, string> = {
  '/': 'Resumen',
  '/notificaciones': 'Notificaciones',
  '/nueva': 'Nueva solicitud',
  '/proveedores': 'Proveedores y ruteo',
  '/suscripciones': 'Suscripciones',
  '/bitacora': 'Bitácora de auditoría',
};

function Topbar({ path }: { path: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger className="-ml-1 text-muted-foreground" />
      <Separator orientation="vertical" className="h-4" />
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">NotifyHub</span>
        <span className="text-ink-3">/</span>
        <span className="font-semibold">{CRUMB[path] ?? 'Consola'}</span>
      </nav>
      <button className="mx-auto hidden h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-ink-3 lg:flex">
        <Search className="size-3.5" /> Buscar notificaciones, IDs, proveedores…
        <kbd className="ml-auto inline-flex items-center gap-0.5 rounded-sm border bg-card px-1.5 font-mono text-[10px]">
          <Command className="size-2.5" />K
        </kbd>
      </button>
      <div className="ml-auto flex items-center gap-3 lg:ml-0">
        <ConnectionButton />
      </div>
    </header>
  );
}

export function Shell({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar path={path} />
      <SidebarInset className="bg-background">
        <Topbar path={path} />
        <div className="mx-auto w-full max-w-[1280px] p-6 md:px-8 md:py-7">{children}</div>
      </SidebarInset>
      <Toaster position="bottom-center" />
    </SidebarProvider>
  );
}
