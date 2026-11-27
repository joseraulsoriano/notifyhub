import type {
  ArchitectureHealth,
  DirectoryUser,
  Member,
  Project,
  Role,
  ServerNotification,
  Session,
  Task,
  TaskStatus,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(MESSAGES[code] ?? code);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_already_registered: 'Ese correo ya está registrado.',
  name_email_and_password_min_10_required:
    'Escribe tu nombre, un correo válido y una contraseña de al menos 10 caracteres.',
  email_and_password_required: 'Escribe tu correo y tu contraseña.',
  user_not_found: 'No se encontró ese usuario.',
  forbidden: 'No tienes permiso para hacer esto.',
  authentication_required: 'Inicia sesión para continuar.',
  invalid_token: 'Tu sesión ya no es válida. Inicia sesión de nuevo.',
  token_revoked: 'Tu sesión se cerró. Inicia sesión de nuevo.',
  session_expired: 'Tu sesión expiró por inactividad. Inicia sesión de nuevo.',
  project_leader_or_admin_required: 'Solo el líder del proyecto o un administrador puede hacer esto.',
  admin_required: 'Solo un administrador puede hacer esto.',
  upstream_unavailable: 'El servicio no responde. Reintenta en unos segundos.',
};

/** Separa los eventos `event:`/`data:` de un flujo SSE. Devuelve lo que sobra sin cerrar. */
export function parseSse(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks.flatMap((block) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    return data.length ? [{ event, data: data.join('\n') }] : [];
  });
  return { events, rest };
}

export type Api = ReturnType<typeof createApi>;

/** Cliente del API Gateway. Toda llamada lleva el JWT; el gateway lo valida y reenvía la identidad. */
export function createApi(baseUrl: string, getToken: () => string | null) {
  const base = baseUrl.replace(/\/$/, '');

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const token = getToken();
    const response = await fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token && init.auth !== false ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }).catch(() => {
      throw new ApiError(0, 'upstream_unavailable');
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new ApiError(response.status, data.error ?? `http_${response.status}`);
    return data;
  }

  return {
    baseUrl: base,
    architecture: () => request<ArchitectureHealth>('/health/services', { auth: false }),

    async login(email: string, password: string): Promise<Session> {
      const data = await request<{ accessToken: string; expiresIn: number; user: User }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      return { token: data.accessToken, user: data.user, expiresAt: Date.now() + data.expiresIn * 1000 };
    },
    register: (name: string, email: string, password: string) =>
      request<{ user: User }>('/api/auth/register', {
        method: 'POST',
        body: { name, email, password },
        auth: false,
      }),
    logout: () => request<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' }),
    me: () => request<{ user: User }>('/api/auth/me'),
    users: () => request<{ users: DirectoryUser[] }>('/api/auth/users'),
    setRole: (userId: string, role: Role) =>
      request<{ user: User }>(`/api/auth/users/${userId}/role`, { method: 'PATCH', body: { role } }),

    projects: {
      list: () => request<{ projects: Project[] }>('/api/projects'),
      create: (name: string, description: string, members: string[]) =>
        request<{ project: Project }>('/api/projects', {
          method: 'POST',
          body: { name, description, members },
        }),
      members: (projectId: string) => request<{ members: Member[] }>(`/api/projects/${projectId}/members`),
      addMember: (projectId: string, userId: string) =>
        request<{ userId: string }>(`/api/projects/${projectId}/members`, {
          method: 'POST',
          body: { userId },
        }),
    },
    tasks: {
      list: (projectId: string) =>
        request<{ tasks: Task[]; source: 'cache' | 'database' }>(`/api/projects/${projectId}/tasks`),
      create: (projectId: string, title: string, description: string, assigneeId: string | null) =>
        request<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
          method: 'POST',
          body: { title, description, assigneeId },
        }),
      setStatus: (taskId: string, status: TaskStatus) =>
        request<{ task: Task }>(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: { status } }),
      assign: (taskId: string, assigneeId: string | null) =>
        request<{ task: Task }>(`/api/tasks/${taskId}/assignee`, { method: 'PATCH', body: { assigneeId } }),
    },
    notifications: {
      list: (limit = 50) =>
        request<{ notifications: ServerNotification[] }>(`/api/notifications?limit=${limit}`),
      read: (id: string) =>
        request<{ notification: ServerNotification }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
      /** Abre el stream SSE (Server-Sent Events). EventSource no permite el encabezado Authorization: se usa fetch. */
      async stream(onNotification: (item: ServerNotification) => void, signal: AbortSignal): Promise<void> {
        const token = getToken();
        const response = await fetch(`${base}/api/notifications/stream`, {
          headers: { accept: 'text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          signal,
        });
        if (!response.ok || !response.body) throw new ApiError(response.status, `http_${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSse(buffer);
          buffer = parsed.rest;
          for (const item of parsed.events)
            if (item.event === 'notification') {
              try {
                onNotification(JSON.parse(item.data) as ServerNotification);
              } catch {
                /* evento mal formado: se ignora */
              }
            }
        }
      },
    },
    presence: {
      online: (userId: string) =>
        request<{ userId: string; online: boolean }>(`/api/presence/online/${userId}`),
    },
  };
}
