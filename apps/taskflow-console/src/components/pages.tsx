import { MFE_URLS } from '@taskflow/kit';
import { ArchitecturePage } from './architecture-page';
import { RemoteMfe } from './remote-mfe';
import { Shell } from './shell';

export const PageProjects = () => (
  <Shell path="/">
    <RemoteMfe name="mfe-projects" title="Proyectos y tareas" src={MFE_URLS.projects} />
  </Shell>
);

export const PageTeam = () => (
  <Shell path="/equipo">
    <RemoteMfe name="mfe-team" title="Equipo y sesión" src={MFE_URLS.team} />
  </Shell>
);

export const PageArchitecture = () => (
  <Shell path="/arquitectura">
    <ArchitecturePage />
  </Shell>
);
