/**
 * Double chance (fix120, decided 17 Oct 2026 by Yarin): our recommended football pick is the two most likely results
 * together — 1X (home or draw), X2 (draw or away) or 12 (either team wins) — with the sum of their chances.
 * The 1X2 percentages stay as they are; the single most likely result is still tracked as the "hard call".
 * Ties go 1X, X2, 12 (same order as the public record always used). Basketball has no draws: not used there.
 * Keep in step with frontend/src/lib/predict.ts doubleChance().
 */
export type DC = '1X' | 'X2' | '12';
export type Outcome = 'H' | 'D' | 'A';

/** Strong pick = the double chance is at least this sure (%). */
export const DC_STRONG = 85;

export function doubleChance(h: number, d: number, a: number): { k: DC; p: number } | null {
  if (![h, d, a].every(Number.isFinite)) return null;
  const c: { k: DC; p: number }[] = [{ k: '1X', p: h + d }, { k: 'X2', p: d + a }, { k: '12', p: h + a }];
  return c.sort((x, y) => y.p - x.p)[0];
}

export const dcHit = (k: DC, o: Outcome) => (k === '1X' ? o !== 'A' : k === 'X2' ? o !== 'H' : o !== 'D');
