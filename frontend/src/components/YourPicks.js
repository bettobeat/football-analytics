import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText } from '../lib/auth';
import { t as tt } from '../lib/i18n';
export function marketLabel(market) {
    return market === 'result' || market === 'win' ? tt('Who wins?') : market === 'ou25' ? tt('Goals: over / under 2.5') : market === 'btts' ? tt('Both teams score?') : tt('Total points');
}
/** Button labels for one market. */
export function optionsFor(market, home, away, line) {
    if (market === 'result')
        return [{ k: 'H', label: home }, { k: 'D', label: tt('Draw') }, { k: 'A', label: away }];
    if (market === 'win')
        return [{ k: 'H', label: home }, { k: 'A', label: away }];
    if (market === 'ou25')
        return [{ k: 'O', label: tt('Over 2.5') }, { k: 'U', label: tt('Under 2.5') }];
    if (market === 'btts')
        return [{ k: 'Y', label: tt('Yes') }, { k: 'N', label: tt('No') }];
    const l = line != null ? String(line) : '';
    return [{ k: 'O', label: tt('Over {0}', { 0: l }) }, { k: 'U', label: tt('Under {0}', { 0: l }) }];
}
export function ResultBadge({ r }) {
    if (r === 'hit')
        return _jsxs("span", { className: "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-win/15 text-win", children: ["\u2713 ", tt('Right')] });
    if (r === 'miss')
        return _jsxs("span", { className: "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-loss/15 text-loss", children: ["\u2715 ", tt('Wrong')] });
    if (r === 'void')
        return _jsx("span", { className: "text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface2 text-muted", children: tt('Void') });
    return _jsx("span", { className: "text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface2 text-muted", children: tt('Waiting for the result') });
}
export default function YourPicks({ sport, gameId, home, away }) {
    const loc = useLocation();
    const [d, setD] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
        let off = false;
        setD(null);
        axios.get(`${API_URL}/picks/game/${sport}/${gameId}`).then(r => { if (!off)
            setD(r.data.data); }).catch(() => { if (!off)
            setD({ signedIn: false, available: false }); });
        return () => { off = true; };
    }, [sport, gameId]);
    if (!d || !d.available || !d.markets?.length)
        return null;
    const picks = d.picks || {};
    const locked = !!d.locked;
    const made = Object.keys(picks).length;
    const choose = (market, k) => {
        if (locked || busy)
            return;
        const next = picks[market]?.pick === k ? null : k; // tap the same choice again to remove it
        setBusy(market);
        setErr(null);
        // instant feedback, then the server's answer
        setD({ ...d, picks: next ? { ...picks, [market]: { pick: next, line: market === 'total' ? d.line ?? null : null, result: 'pending' } } : Object.fromEntries(Object.entries(picks).filter(([m]) => m !== market)) });
        axios.post(`${API_URL}/picks`, { sport, id: gameId, market, pick: next })
            .then(r => setD(r.data.data))
            .catch(e => { setErr(errorText(e)); setD(d); })
            .finally(() => setBusy(null));
    };
    return (_jsxs("section", { className: "card p-5 sm:p-6", "aria-labelledby": `yp-${gameId}`, children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [_jsx("h2", { id: `yp-${gameId}`, className: "font-display text-base font-bold text-ink", children: tt('Your picks') }), _jsx("span", { className: "text-xs text-faint", children: locked ? (sport === 'bb' ? tt('Locked at tip-off') : tt('Locked at kick-off')) : d.signedIn ? (sport === 'bb' ? tt('Change them until tip-off') : tt('Change them until kick-off')) : tt('Free for every account') })] }), !d.signedIn ? (_jsxs("div", { className: "rounded-2xl border border-line/60 bg-surface2/40 p-4 sm:p-5 flex flex-wrap items-center gap-3 justify-between", children: [_jsx("p", { className: "text-sm text-muted max-w-md", children: tt('Pick the winner, goals and more yourself, and build your own record against the results.') }), _jsx(Link, { to: `/login?next=${encodeURIComponent(loc.pathname)}`, className: "px-4 py-2 rounded-xl bg-accent text-bg font-semibold text-sm", children: tt('Sign in to pick') })] })) : locked && !made ? (_jsx("p", { className: "text-sm text-faint", children: tt('You made no picks for this game.') })) : (_jsxs("div", { className: "space-y-4", children: [d.markets.map(market => {
                        const mine = picks[market];
                        if (locked && !mine)
                            return null;
                        const opts = optionsFor(market, home, away, mine?.line ?? d.line);
                        return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between gap-2 mb-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-muted", children: marketLabel(market) }), mine && locked && _jsx(ResultBadge, { r: mine.result })] }), _jsx("div", { className: `grid gap-2 ${opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`, role: "radiogroup", "aria-label": marketLabel(market), children: opts.map(o => {
                                        const on = mine?.pick === o.k;
                                        return (_jsx("button", { type: "button", role: "radio", "aria-checked": on, disabled: locked || busy === market, onClick: () => choose(market, o.k), className: `min-w-0 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors truncate ${on ? 'bg-accent text-bg border-accent' : locked ? 'border-line/50 text-faint' : 'border-line hover:border-accent/60 text-ink'} ${locked ? 'cursor-default' : ''}`, children: o.label }, o.k));
                                    }) })] }, market));
                    }), err && _jsx("p", { className: "text-xs text-loss", role: "alert", children: err }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 pt-1", children: [_jsx("span", { className: "text-[11px] text-faint", children: locked ? tt('Your picks are saved in your personal record.') : made ? tt('Saved. Tap again to remove a pick.') : (sport === 'bb' ? tt('Tap to pick before tip-off.') : tt('Tap to pick before kick-off.')) }), _jsxs(Link, { to: "/my-picks", className: "text-xs font-semibold text-accent hover:underline", children: [tt('My record'), " \u2192"] })] })] }))] }));
}
