const ROLES = new Set(["admin", "leader", "member"]);
const TASK_STATUSES = new Set(["pending", "in_progress", "completed"]);

function isProjectManager(actor, project) {
  return actor.role === "admin" || actor.id === project.leader_id;
}

function canViewProject(actor, project, memberIds) {
  return (
    actor.role === "admin" ||
    actor.id === project.leader_id ||
    memberIds.includes(actor.id)
  );
}

function canAssignTo(actor, project, assigneeId, currentAssigneeId = null) {
  return (
    isProjectManager(actor, project) ||
    (currentAssigneeId === null && assigneeId === actor.id)
  );
}

function canChangeTaskStatus(actor, task) {
  return actor.id === task.assignee_id;
}

module.exports = {
  ROLES,
  TASK_STATUSES,
  canAssignTo,
  canChangeTaskStatus,
  canViewProject,
  isProjectManager,
};
