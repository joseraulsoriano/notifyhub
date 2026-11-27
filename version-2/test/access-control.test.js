const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TASK_STATUSES,
  canAssignTo,
  canChangeTaskStatus,
  canViewProject,
  isProjectManager,
} = require("../shared/access-control");

const project = { leader_id: "leader-1" };

test("assignment is limited to the project leader or an admin", () => {
  assert.equal(isProjectManager({ id: "member-1", role: "member" }, project), false);
  assert.equal(isProjectManager({ id: "leader-1", role: "leader" }, project), true);
  assert.equal(isProjectManager({ id: "admin-1", role: "admin" }, project), true);
  assert.equal(canAssignTo({ id: "member-1", role: "member" }, project, "other-1"), false);
  assert.equal(canAssignTo({ id: "member-1", role: "member" }, project, "member-1"), true);
});

test("project visibility and status changes require the right user", () => {
  const member = { id: "member-1", role: "member" };
  assert.equal(canViewProject(member, project, ["member-1"]), true);
  assert.equal(canViewProject(member, project, []), false);
  assert.equal(canChangeTaskStatus(member, { assignee_id: "member-1" }), true);
  assert.equal(canChangeTaskStatus(member, { assignee_id: "other-1" }), false);
});

test("task statuses match the required state machine", () => {
  assert.deepEqual([...TASK_STATUSES].sort(), ["completed", "in_progress", "pending"]);
});
