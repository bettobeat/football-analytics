/**
 * Leagues "in testing" (Oct 2026): their predictions are made and recorded like any other, so we build a track
 * record from day one, but they stay out of the public record until v3 has proven itself on them. The site shows
 * a "New league · in testing" note on their matches.
 * Override with TRIAL_COMPETITIONS=AF79,AF71,… in Railway ("none" = every league counts publicly).
 */
const DEFAULT_TRIAL = [
  'AF79', 'AF136', 'AF141', 'AF62', 'AF180', 'AF41', // second divisions + League One
  'AF71', 'AF128', 'AF253', 'AF262', 'AF98', 'AF119', 'AF106', 'AF103', 'AF113' // Americas, Japan, Nordics, Poland
];

const env = (process.env.TRIAL_COMPETITIONS || '').trim();
export const TRIAL_COMPETITIONS = new Set(
  env.toLowerCase() === 'none' ? [] : env ? env.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : DEFAULT_TRIAL
);
export const isTrialCompetition = (code?: string | null) => !!code && TRIAL_COMPETITIONS.has(String(code).toUpperCase());
