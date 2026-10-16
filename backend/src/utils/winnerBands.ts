/**
 * "Our record" bars of the home page (fix141) for sports where the pick is the winner (basketball, NFL): how often the
 * picked team won, for all picks and when we were 60% / 70% / 80%+ sure of it (cumulative, like football's highlights).
 * `p` = the chance we gave the picked team (0.5–1).
 */
export const WINNER_BANDS = [0, 60, 70, 80] as const;

export function winnerBands(rows: { p: number; hit: boolean }[]) {
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return WINNER_BANDS.map(min => {
    const sel = rows.filter(r => 100 * r.p >= min);
    const hits = sel.filter(r => r.hit).length;
    return { min, n: sel.length, hits, pct: pct(hits, sel.length) };
  });
}
