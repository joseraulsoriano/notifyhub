import { SHELL_URL, TfApp, useSession } from '@taskflow/kit';
import { TeamView } from './views/TeamView';

function Gate() {
  const { session, waiting } = useSession();
  if (waiting) return <p className="p-6 text-sm text-muted-foreground">Conectando con TaskFlow…</p>;
  if (!session) return <p className="p-6 text-sm text-muted-foreground">Inicia sesión en TaskFlow para ver tu equipo.</p>;
  return <TeamView session={session} />;
}

export function App() {
  return (
    <TfApp title="Equipo y sesión" shellUrl={SHELL_URL}>
      <Gate />
    </TfApp>
  );
}
