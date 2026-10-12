import { LayoutDashboard, Mail, Plus, ScrollText, Settings2, Webhook } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Logo } from '@notifyhub/ui';
import { useConnection } from '@/lib/connection';

const GROUPS = [
  {
    label: 'Operación',
    items: [
      { href: '/', title: 'Resumen', icon: LayoutDashboard },
      { href: '/notificaciones', title: 'Notificaciones', icon: Mail },
      { href: '/nueva', title: 'Nueva solicitud', icon: Plus },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { href: '/proveedores', title: 'Proveedores y ruteo', icon: Settings2 },
      { href: '/suscripciones', title: 'Suscripciones', icon: Webhook },
    ],
  },
  { label: 'Control', items: [{ href: '/bitacora', title: 'Bitácora de auditoría', icon: ScrollText }] },
];

export function AppSidebar({ path }: { path: string }) {
  const { connection } = useConnection();
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-3 pt-5">
        <a href="/" aria-label="NotifyHub">
          <Logo />
        </a>
      </SidebarHeader>
      <SidebarContent className="px-3">
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label} className="px-0">
            <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              {g.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {g.items.map((i) => {
                  const on = active(i.href);
                  return (
                    <SidebarMenuItem key={i.href}>
                      <SidebarMenuButton
                        isActive={on}
                        render={<a href={i.href} />}
                        className="relative h-8 font-medium text-muted-foreground data-active:bg-secondary data-active:font-semibold data-active:text-foreground [&_svg]:size-4"
                      >
                        {on && (
                          <span className="absolute -left-3 bottom-1.5 top-1.5 w-[3px] rounded-r-sm bg-transfer" />
                        )}
                        <i.icon /> <span>{i.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-4 text-xs text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
          <span
            className={
              connection.mode === 'live'
                ? 'size-2 rounded-full bg-success'
                : 'size-2 rounded-full border-2 border-ink-3'
            }
          />
          {connection.mode === 'live' ? 'Conectado' : 'Modo demo'}
        </div>
        <p className="break-all font-mono text-[11px]">
          {connection.mode === 'live' ? new URL(connection.baseUrl).host : 'Datos de ejemplo'}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
