import { notify } from '@notifyhub/mfe-runtime';
import { Badge } from '@notifyhub/mfe-runtime/ui/badge';
import { Button } from '@notifyhub/mfe-runtime/ui/button';
import { Input } from '@notifyhub/mfe-runtime/ui/input';
import { Textarea } from '@notifyhub/mfe-runtime/ui/textarea';
import {
  API_URL,
  ApiError,
  STATUS_LABEL,
  createApi,
  getToken,
  type DirectoryUser,
  type Member,
  type Project,
  type Session,
  type Task,
  type TaskStatus,
} from '@taskflow/kit';
import { Database, FolderPlus, Plus, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

const api = createApi(API_URL, getToken);
const COLUMNS: TaskStatus[] = ['pending', 'in_progress', 'completed'];
const NEXT: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['pending', 'completed'],
  completed: ['in_progress'],
};

const fail = (e: unknown, fallback: string) => notify.error(e instanceof ApiError ? e.message : fallback);

export function ProjectsView({ session }: { session: Session }) {
  const me = session.user;
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const { projects } = await api.projects.list();
      setProjects(projects);
      setSelected((current) => current ?? projects[0]?.id ?? null);
    } catch (e) {
      setProjects([]);
      fail(e, 'No se pudieron cargar los proyectos.');
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    api.users().then((r) => setDirectory(r.users), () => {});
  }, [loadProjects]);

  const project = projects?.find((p) => p.id === selected) ?? null;

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const { project } = await api.projects.create(
        String(form.get('name') ?? '').trim(),
        String(form.get('description') ?? '').trim(),
        form.getAll('members').map(String),
      );
      notify.success(`Proyecto «${project.name}» creado`);
      setCreating(false);
      setSelected(project.id);
      await loadProjects();
    } catch (e) {
      fail(e, 'No se pudo crear el proyecto.');
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-[17rem_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Proyectos</h2>
          <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
            <FolderPlus className="size-3.5" /> Nuevo
          </Button>
        </div>

        {creating && (
          <form onSubmit={createProject} className="space-y-2.5 rounded-xl border bg-card p-3">
            <Input name="name" placeholder="Nombre del proyecto" required maxLength={120} />
            <Textarea name="description" placeholder="Descripción (opcional)" rows={2} />
            {directory.filter((u) => u.id !== me.id).length > 0 && (
              <fieldset className="max-h-32 space-y-1 overflow-y-auto text-sm">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">Miembros</legend>
                {directory
                  .filter((u) => u.id !== me.id)
                  .map((u) => (
                    <label key={u.id} className="flex items-center gap-2">
                      <input type="checkbox" name="members" value={u.id} /> {u.name}
                    </label>
                  ))}
              </fieldset>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm">Crear</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            </div>
          </form>
        )}

        {projects === null && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {projects?.length === 0 && !creating && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Aún no tienes proyectos. Crea el primero con «Nuevo».
          </p>
        )}
        <ul className="space-y-1.5">
          {projects?.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelected(p.id)}
                aria-current={p.id === selected ? 'true' : undefined}
                className="w-full rounded-xl border bg-card px-3 py-2.5 text-left transition hover:border-primary/50 aria-[current=true]:border-primary aria-[current=true]:bg-accent/60"
              >
                <p className="truncate text-sm font-semibold">{p.name}</p>
                {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description}</p>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0">
        {project ? (
          <Board key={project.id} project={project} me={me} directory={directory} />
        ) : (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Elige o crea un proyecto para ver su tablero.
          </p>
        )}
      </section>
    </div>
  );
}

function Board({ project, me, directory }: { project: Project; me: Session['user']; directory: DirectoryUser[] }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [source, setSource] = useState<'cache' | 'database' | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const isManager = me.role === 'admin' || project.leader_id === me.id;
  const names = useMemo(() => new Map([...directory, ...members].map((u) => [u.id, u.name])), [directory, members]);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([api.tasks.list(project.id), api.projects.members(project.id)]);
      setTasks(t.tasks);
      setSource(t.source);
      setMembers(m.members);
    } catch (e) {
      setTasks([]);
      fail(e, 'No se pudo cargar el tablero.');
    }
  }, [project.id]);

  useEffect(() => void load(), [load]);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    try {
      await action();
      notify.success(ok);
      await load();
    } catch (e) {
      fail(e, 'No se pudo completar la acción.');
    }
  };

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const assignee = String(data.get('assignee') ?? '') || null;
    await run(
      () => api.tasks.create(project.id, String(data.get('title') ?? '').trim(), String(data.get('description') ?? '').trim(), assignee),
      'Tarea creada',
    );
    form.reset();
  };

  const assignable = isManager ? members : members.filter((m) => m.id === me.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{project.name}</h2>
        <Badge variant="outline">Líder: {names.get(project.leader_id) ?? '…'}</Badge>
        <Badge variant="outline">{members.length} miembros</Badge>
        {source && (
          <Badge variant="secondary" title="Patrón cache-aside: primero Redis, y si no está, PostgreSQL">
            {source === 'cache' ? <Zap className="size-3" /> : <Database className="size-3" />}
            {source === 'cache' ? 'Leído de Redis' : 'Leído de PostgreSQL'}
          </Badge>
        )}
      </div>

      <form onSubmit={addTask} className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_1fr_11rem_auto]">
        <Input name="title" placeholder="Título de la tarea" required maxLength={160} aria-label="Título" />
        <Input name="description" placeholder="Descripción (opcional)" aria-label="Descripción" />
        <select name="assignee" aria-label="Responsable" className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">Sin asignar</option>
          {assignable.map((m) => (
            <option key={m.id} value={m.id}>{m.id === me.id ? 'Yo' : m.name}</option>
          ))}
        </select>
        <Button type="submit"><Plus className="size-4" /> Agregar</Button>
      </form>

      {tasks === null ? (
        <p className="text-sm text-muted-foreground">Cargando tablero…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {COLUMNS.map((status) => {
            const items = tasks.filter((t) => t.status === status);
            return (
              <div key={status} className="rounded-xl bg-muted/70 p-2.5" aria-label={STATUS_LABEL[status]}>
                <p className="mb-2 flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABEL[status]} <span>{items.length}</span>
                </p>
                <ul className="space-y-2">
                  {items.length === 0 && <li className="px-1 py-3 text-xs text-muted-foreground">Sin tareas.</li>}
                  {items.map((task) => {
                    const mine = task.assignee_id === me.id;
                    return (
                      <li key={task.id} className="rounded-lg border bg-card p-3 text-sm shadow-xs">
                        <p className="font-semibold">{task.title}</p>
                        {task.description && <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {task.assignee_id ? `Responsable: ${mine ? 'tú' : (names.get(task.assignee_id) ?? '…')}` : 'Sin responsable'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {mine &&
                            NEXT[task.status].map((next) => (
                              <Button
                                key={next}
                                size="sm"
                                variant={next === 'completed' ? 'default' : 'outline'}
                                onClick={() => run(() => api.tasks.setStatus(task.id, next), `«${task.title}» → ${STATUS_LABEL[next]}`)}
                              >
                                {STATUS_LABEL[next]}
                              </Button>
                            ))}
                          {!task.assignee_id && !isManager && (
                            <Button size="sm" variant="outline" onClick={() => run(() => api.tasks.assign(task.id, me.id), 'Tarea tomada')}>
                              Tomarla
                            </Button>
                          )}
                          {isManager && (
                            <select
                              aria-label={`Asignar «${task.title}»`}
                              value={task.assignee_id ?? ''}
                              onChange={(e) =>
                                run(() => api.tasks.assign(task.id, e.target.value || null), 'Responsable actualizado')
                              }
                              className="h-8 rounded-md border bg-background px-1.5 text-xs"
                            >
                              <option value="">Sin asignar</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>{m.id === me.id ? 'Yo' : m.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
