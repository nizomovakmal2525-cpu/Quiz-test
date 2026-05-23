export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

export function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('uz-UZ', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function percent(score, total) {
  if (!total) return 0;
  return Math.round((Number(score) / Number(total)) * 100);
}

export function layout({ title, user, admin = false, active = '', body, flash = '' }) {
  const nav = user
    ? `
      <a class="${active === 'rules' ? 'active' : ''}" href="/rules">Qoidalar</a>
      <a class="${active === 'create' ? 'active' : ''}" href="/create">Create Quiz Test</a>
      <a class="${active === 'quizzes' ? 'active' : ''}" href="/quizzes">Quiz tests</a>
      ${admin ? '<a class="admin-link" href="/admin">Admin</a>' : ''}
    `
    : `
      <a class="${active === 'rules' ? 'active' : ''}" href="/rules">Qoidalar</a>
      <a class="${active === 'login' ? 'active' : ''}" href="/login">Login</a>
      <a class="button small" href="/register">Register</a>
    `;

  return `<!doctype html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Quiz Test AI</title>
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="${user ? '/quizzes' : '/rules'}" aria-label="Quiz Test AI">
      <span class="brand-mark">QT</span>
      <span>Quiz Test AI</span>
    </a>
    <nav>${nav}</nav>
    ${user ? `
      <div class="user-menu">
        <span class="avatar">${escapeHtml(initials(user.full_name || user.email || 'Admin'))}</span>
        <span class="user-name">${escapeHtml(user.full_name || user.email || 'Admin')}</span>
        <form action="/logout" method="post">
          <button class="link-button" type="submit">Chiqish</button>
        </form>
      </div>
    ` : ''}
  </header>
  <main>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}
    ${body}
  </main>
</body>
</html>`;
}

export function fieldError(message) {
  return message ? `<p class="field-error">${escapeHtml(message)}</p>` : '';
}
