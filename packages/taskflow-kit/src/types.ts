export type Role = 'admin' | 'leader' | 'member';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export type User = { id: string; name: string; email: string; role: Role };
/** Entrada del directorio: el servicio de usuarios no expone correos. */
export type DirectoryUser = { id: string; name: string; role: Role };

export type Session = { token: string; user: User; expiresAt: number };

export type Project = {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  created_at: string;
};
export type Member = DirectoryUser & { is_leader: boolean };

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_id: string | null;
  created_at: string;
};

export type ServerNotification = {
  id: string;
  event_id: string;
  task_id: string;
  event_type: 'task_assigned' | 'task_status_changed' | string;
  payload: { task?: { title?: string; status?: TaskStatus }; actorId?: string };
  read_at: string | null;
  created_at: string;
};

export type ServiceHealth = { ok: boolean; ms: number };
export type ArchitectureHealth = {
  gateway: { ok: boolean };
  redis: ServiceHealth;
  services: Record<'auth' | 'tasks' | 'notifications' | 'presence', ServiceHealth>;
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
};
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  leader: 'Líder',
  member: 'Miembro',
};
