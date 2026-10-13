import { useEffect, useState } from 'react';
/**
 * "Guess first": premium members see each upcoming game with our prediction covered until they tap Reveal,
 * so they can make their own call first. On by default; can be switched off (Account page, or "Always show").
 * Per browser (localStorage). Finished games are never covered.
 */
const PREF = 'b2b_guess_first';
const KEY = 'b2b_revealed';
const EVT = 'b2b-reveal-change';
const DONE = new Set(['FINISHED', 'AWARDED', 'FT', 'AET', 'PEN']);
function read(k) {
    try {
        return localStorage.getItem(k);
    }
    catch {
        return null;
    }
}
function write(k, v) {
    try {
        localStorage.setItem(k, v);
    }
    catch { /* private mode: in-memory only */ }
}
let memRevealed = null;
function revealedIds() {
    if (memRevealed)
        return memRevealed;
    try {
        memRevealed = JSON.parse(read(KEY) || '[]');
    }
    catch {
        memRevealed = [];
    }
    return memRevealed;
}
export function guessFirstOn() {
    return read(PREF) !== '0';
}
export function setGuessFirst(on) {
    write(PREF, on ? '1' : '0');
    window.dispatchEvent(new Event(EVT));
}
function useTick() {
    const [, setN] = useState(0);
    useEffect(() => {
        const f = () => setN(n => n + 1);
        window.addEventListener(EVT, f);
        return () => window.removeEventListener(EVT, f);
    }, []);
}
export function useGuessFirst() {
    useTick();
    return [guessFirstOn(), setGuessFirst];
}
/** Covered right now? (plain function; pair it with useRevealState() so the page re-renders on changes) */
export function isCovered(matchId, status, enabled) {
    return enabled && !!matchId && guessFirstOn() && !DONE.has(String(status || '')) && !revealedIds().includes(matchId);
}
const revealedAt = new Map();
/** Revealed in the last few seconds (on this page)? Then the numbers roll in instead of just appearing. */
export function justRevealed(matchId) {
    const t = matchId ? revealedAt.get(matchId) : undefined;
    return !!t && Date.now() - t < 4000;
}
export function revealMatch(matchId) {
    if (!matchId)
        return;
    revealedAt.set(matchId, Date.now());
    const ids = revealedIds().filter(x => x !== matchId);
    ids.push(matchId);
    memRevealed = ids.slice(-500);
    write(KEY, JSON.stringify(memRevealed));
    window.dispatchEvent(new Event(EVT));
}
/** Cover it again (so the member can replay the reveal). */
export function hideMatch(matchId) {
    if (!matchId)
        return;
    memRevealed = revealedIds().filter(x => x !== matchId);
    write(KEY, JSON.stringify(memRevealed));
    window.dispatchEvent(new Event(EVT));
}
/** Re-render when reveals or the preference change (for pages that call isCovered in a list). */
export function useRevealState() {
    useTick();
}
/** Is this match's prediction covered for this viewer? `enabled` = the viewer sees full predictions (premium). */
export function useReveal(matchId, status, enabled) {
    useTick();
    return { hidden: isCovered(matchId, status, enabled), reveal: () => revealMatch(matchId) };
}
