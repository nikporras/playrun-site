/**
 * Tracker IDs for the games, in the style of the bug ticket: PR-001, PR-002 and so on. The order
 * is stable and comes from the data alone: the posts from the first to the latest (the reverse of
 * `employers`), then each post's titles by year (titles in development last), then by slug. A new
 * game at a new post takes the next number and moves no other; nothing is random.
 */
import { employers } from '../config';

type Project = { id: string; data: { employer: string; year?: number; status?: string } };

export function trackerIds(projects: Project[]): Map<string, string> {
  const post = (p: Project) => employers.length - 1 - employers.findIndex((e) => e.id === p.data.employer);
  const year = (p: Project) => (p.data.status === 'in-development' ? Infinity : (p.data.year ?? Infinity));
  const sorted = [...projects].sort((a, b) => post(a) - post(b) || year(a) - year(b) || a.id.localeCompare(b.id));
  return new Map(sorted.map((p, i) => [p.id, `PR-${String(i + 1).padStart(3, '0')}`]));
}
