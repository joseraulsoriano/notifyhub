import { SHELL_URL, TfApp, useSession } from '@taskflow/kit';
import { ProjectsView } from './views/ProjectsView';

function Gate() {
  const { session, waiting } = useSession();
  if (waiting) return <p className="p-6 text-sm text-muted-foreground">Conectando con TaskFlow…</p>;
  if (!session) return <p className="p-6 text-sm text-muted-foreground">Inicia sesión en TaskFlow para ver tus proyectos.</p>;
  return <ProjectsView session={session} />;
}

export function App() {
  return (
    <TfApp title="Proyectos y tareas" shellUrl={SHELL_URL}>
      <Gate />
    </TfApp>
  );
}
