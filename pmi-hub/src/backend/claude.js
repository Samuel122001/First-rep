// claude.ai backend: the artifact runtime's shared database, the viewer's
// identity, file downloads and "ask Claude" (window.claude.use).
export async function createClaudeBackend() {
  const claude = window.claude;
  if (!claude || typeof claude.use !== 'function') return null;
  const [db, user, downloads, sample] = await Promise.all(['db', 'user', 'downloads', 'sample'].map((n) => claude.use(n).catch(() => null)));
  return { kind: 'claude', db, user, downloads, sample, auth: null };
}
