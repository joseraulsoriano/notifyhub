import type { NotificationListItem } from '@notifyhub/client';
import { NotificationDetail, useNotification } from '@notifyhub/ui';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ExternalLink } from 'lucide-react';

/** Detalle de una notificación: pide los intentos y el historial y los actualiza mientras no termine. */
export function NotificationPanel({ item }: { item: NotificationListItem }) {
  const { data, loading } = useNotification(item.id, { intervalMs: 1500 });
  return (
    <NotificationDetail
      item={item}
      detail={data}
      loading={loading}
      onCopyId={() => toast.success('ID copiado')}
      actions={
        <Button variant="outline" render={<a href={`/bitacora?notificationId=${item.id}`} />}>
          <ExternalLink /> Ver en bitácora
        </Button>
      }
    />
  );
}

/** El mismo detalle como panel deslizable, para pantallas angostas y para el Resumen. */
export function NotificationSheet({
  item,
  onClose,
}: {
  item: NotificationListItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="sr-only">
          <SheetTitle>{item?.subject ?? 'Notificación'}</SheetTitle>
          <SheetDescription>Detalle de la notificación</SheetDescription>
        </SheetHeader>
        {item && (
          <div className="p-5 pt-10">
            <NotificationPanel item={item} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
