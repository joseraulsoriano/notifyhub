const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const baseUrl = process.env.TASKFLOW_API_URL;

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function waitForStreamEvent(response, fragment) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const timeout = setTimeout(() => reader.cancel(), 10000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes(fragment)) return buffer;
    }
    throw new Error(`SSE stream closed before receiving ${fragment}`);
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
  }
}

test(
  "gateway integrates auth, task authorization, Redis cache, notifications, and presence",
  { skip: !baseUrl },
  async () => {
    const adminEmail = process.env.TASKFLOW_ADMIN_EMAIL;
    const adminPassword = process.env.TASKFLOW_ADMIN_PASSWORD;
    assert.ok(adminEmail && adminPassword, "Set TASKFLOW_ADMIN_EMAIL and TASKFLOW_ADMIN_PASSWORD");

    const adminLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email: adminEmail, password: adminPassword },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.accessToken;
    const suffix = randomUUID();

    const leaderRegistration = await request("/api/auth/register", {
      method: "POST",
      body: { name: "Project Leader", email: `leader-${suffix}@example.test`, password: "Leader-Password-123" },
    });
    const memberRegistration = await request("/api/auth/register", {
      method: "POST",
      body: { name: "Project Member", email: `member-${suffix}@example.test`, password: "Member-Password-123" },
    });
    assert.equal(leaderRegistration.status, 201);
    assert.equal(memberRegistration.status, 201);

    const leaderId = leaderRegistration.data.user.id;
    const memberId = memberRegistration.data.user.id;
    const promotion = await request(`/api/auth/users/${leaderId}/role`, {
      token: adminToken,
      method: "PATCH",
      body: { role: "leader" },
    });
    assert.equal(promotion.status, 200);

    const [leaderLogin, memberLogin] = await Promise.all([
      request("/api/auth/login", {
        method: "POST",
        body: { email: `leader-${suffix}@example.test`, password: "Leader-Password-123" },
      }),
      request("/api/auth/login", {
        method: "POST",
        body: { email: `member-${suffix}@example.test`, password: "Member-Password-123" },
      }),
    ]);
    assert.equal(leaderLogin.status, 200);
    assert.equal(memberLogin.status, 200);
    const leaderToken = leaderLogin.data.accessToken;
    const memberToken = memberLogin.data.accessToken;

    const projectResponse = await request("/api/projects", {
      token: leaderToken,
      method: "POST",
      body: { name: `Integration ${suffix}`, members: [memberId] },
    });
    assert.equal(projectResponse.status, 201);
    const projectId = projectResponse.data.project.id;

    const firstList = await request(`/api/projects/${projectId}/tasks`, { token: memberToken });
    const cachedList = await request(`/api/projects/${projectId}/tasks`, { token: memberToken });
    assert.equal(firstList.data.source, "database");
    assert.equal(cachedList.data.source, "cache");
    const streamController = new AbortController();
    const streamResponse = await fetch(`${baseUrl}/api/notifications/stream`, {
      headers: { authorization: `Bearer ${memberToken}` },
      signal: streamController.signal,
    });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get("content-type"), /text\/event-stream/);
    const assignmentEvent = waitForStreamEvent(streamResponse, '"event_type":"task_assigned"');

    const forbiddenAssignment = await request(`/api/projects/${projectId}/tasks`, {
      token: memberToken,
      method: "POST",
      body: { title: "Not allowed to assign another member", assigneeId: leaderId },
    });
    assert.equal(forbiddenAssignment.status, 403);

    const taskResponse = await request(`/api/projects/${projectId}/tasks`, {
      token: leaderToken,
      method: "POST",
      body: { title: "Integration task", assigneeId: memberId },
    });
    assert.equal(taskResponse.status, 201);
    const taskId = taskResponse.data.task.id;
    await assignmentEvent;
    streamController.abort();
    const afterCreate = await request(`/api/projects/${projectId}/tasks`, { token: memberToken });
    assert.equal(afterCreate.data.source, "database");

    const forbiddenStatus = await request(`/api/tasks/${taskId}/status`, {
      token: leaderToken,
      method: "PATCH",
      body: { status: "in_progress" },
    });
    assert.equal(forbiddenStatus.status, 403);

    const statusUpdate = await request(`/api/tasks/${taskId}/status`, {
      token: memberToken,
      method: "PATCH",
      body: { status: "in_progress" },
    });
    assert.equal(statusUpdate.status, 200);
    assert.equal(statusUpdate.data.task.status, "in_progress");

    const deadline = Date.now() + 10000;
    let memberNotifications;
    let leaderNotifications;
    while (Date.now() < deadline) {
      [memberNotifications, leaderNotifications] = await Promise.all([
        request("/api/notifications", { token: memberToken }),
        request("/api/notifications", { token: leaderToken }),
      ]);
      if (
        memberNotifications.data.notifications?.some((item) => item.event_type === "task_assigned") &&
        leaderNotifications.data.notifications?.some((item) => item.event_type === "task_status_changed")
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(memberNotifications.data.notifications.some((item) => item.event_type === "task_assigned"));
    assert.ok(leaderNotifications.data.notifications.some((item) => item.event_type === "task_status_changed"));

    const online = await request(`/api/presence/online/${memberId}`, { token: leaderToken });
    assert.equal(online.data.online, true);
    const logout = await request("/api/auth/logout", { token: memberToken, method: "POST" });
    assert.equal(logout.status, 200);
    const rejectedSession = await request("/api/auth/me", { token: memberToken });
    assert.equal(rejectedSession.status, 401);
    const offline = await request(`/api/presence/online/${memberId}`, { token: leaderToken });
    assert.equal(offline.data.online, false);
  },
);
