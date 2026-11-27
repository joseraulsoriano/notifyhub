// Islas de React de este microfrontend: cada ruta monta su pantalla dentro del marco común.
import { MfeApp } from '@notifyhub/mfe-runtime';
import { ProvidersPage } from './views/ProvidersPage';
import { AuditLog } from './views/AuditLog';

export function ProvidersApp() {
  return (
    <MfeApp title="Proveedores y ruteo">
      <ProvidersPage />
    </MfeApp>
  );
}

export function AuditApp() {
  return (
    <MfeApp title="Bitácora de auditoría">
      <AuditLog />
    </MfeApp>
  );
}
