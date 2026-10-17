/**
 * fix164: the one link to a football team page. API-Football ids open directly; a Football-Data.org id carries the
 * team's full name and the competition code only when it is a domestic league (a cup code — Champions League, Europa,
 * national cups — says nothing about the club: the server finds the team from its id and name).
 */
const AF_OFFSET = 1_000_000_000
const CUPS = new Set(['CL', 'EL', 'ECL', 'EC', 'WC', 'CLI', 'CSL', 'AF1', 'AF2', 'AF3', 'AF4', 'AF5', 'AF9', 'AF10', 'AF45', 'AF48', 'AF66', 'AF81', 'AF96', 'AF137', 'AF143', 'AF848'])

export function footballTeamHref(id: number, name: string, code?: string | null): string {
  if (id >= AF_OFFSET) return `/team/${id}`
  const q: Record<string, string> = {}
  if (code && !CUPS.has(code.toUpperCase())) q.c = code
  q.n = name
  return `/team/${id}?${new URLSearchParams(q).toString()}`
}
