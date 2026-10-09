export default {
  extends: ['@commitlint/config-conventional'],
  // El asunto empieza con la clave de Jira (SCRUM-22), que va en mayúsculas.
  rules: { 'subject-case': [0] },
};
