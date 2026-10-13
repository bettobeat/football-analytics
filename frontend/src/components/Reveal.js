import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { setGuessFirst } from '../lib/reveal';
import { t as tt } from '../lib/i18n';
const Eye = ({ size = 18 }) => (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] }));
const Spinner = ({ size = 16 }) => (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", className: "animate-spin", "aria-hidden": true, children: [_jsx("circle", { cx: "12", cy: "12", r: "9", fill: "none", stroke: "currentColor", strokeOpacity: "0.25", strokeWidth: "3" }), _jsx("path", { d: "M21 12a9 9 0 0 0-9-9", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round" })] }));
// buttons can sit inside a card that is itself a link: keep the click from opening the match
const stop = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
};
const STEPS = [tt("Loading both squads"), tt("Reading form and strength"), tt("Checking injuries and lineups"), tt("Weighing home and away"), tt("Scoring the match")];
/**
 * Big cover for the match page. Tap Reveal → a short "v3 is analysing" sequence (steps tick by, a bar fills,
 * a scan line sweeps), then the prediction appears and its numbers roll in to their values.
 */
export function RevealCover({ onReveal, autoStart = false }) {
    // autoStart: the analysing sequence plays straight away (right after a match is unlocked)
    const [phase, setPhase] = useState(autoStart ? 'loading' : 'idle');
    const [step, setStep] = useState(0);
    const [fill, setFill] = useState(false);
    useEffect(() => {
        if (phase !== 'loading')
            return;
        const total = 1700;
        const f = requestAnimationFrame(() => setFill(true));
        const iv = setInterval(() => setStep(s => Math.min(STEPS.length - 1, s + 1)), total / STEPS.length);
        const done = setTimeout(onReveal, total);
        return () => { cancelAnimationFrame(f); clearInterval(iv); clearTimeout(done); };
    }, [phase]);
    if (phase === 'loading')
        return (_jsxs("div", { className: "relative overflow-hidden rounded-2xl border border-accent/40 bg-accent/[0.06] p-6 sm:p-8", role: "status", "aria-live": "polite", children: [_jsx("div", { "aria-hidden": true, className: "absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-accent/15 to-transparent animate-[scan_1.1s_linear_infinite]" }), _jsxs("div", { className: "relative flex flex-col items-center gap-4 text-center", children: [_jsxs("div", { className: "flex items-center gap-2.5 text-accent font-display font-bold", children: [_jsx(Spinner, { size: 18 }), " ", tt("v3 is analysing this match")] }), _jsx("div", { className: "w-full max-w-md h-2 rounded-full bg-surface2 overflow-hidden", children: _jsx("div", { className: "h-full rounded-full bg-accent transition-[width] ease-out", style: { width: fill ? '100%' : '4%', transitionDuration: '1700ms' } }) }), _jsx("ul", { className: "w-full max-w-md space-y-1.5 text-left text-sm", children: STEPS.map((s, i) => (_jsxs("li", { className: `flex items-center gap-2.5 transition-opacity duration-300 ${i <= step ? 'opacity-100' : 'opacity-30'}`, children: [_jsx("span", { className: `w-4 h-4 rounded-full grid place-items-center text-[10px] font-extrabold ${i < step ? 'bg-accent text-bg' : i === step ? 'border-2 border-accent' : 'border border-line'}`, children: i < step ? '✓' : '' }), _jsx("span", { className: i <= step ? 'text-ink' : 'text-faint', children: s })] }, s))) })] })] }));
    return (_jsxs("div", { className: "rounded-2xl border border-dashed border-accent/40 bg-accent/[0.06] p-6 sm:p-8 text-center flex flex-col items-center gap-3", children: [_jsx("div", { className: "font-display text-lg font-bold text-ink", children: tt("What's your call?") }), _jsx("p", { className: "text-sm text-muted max-w-sm", children: tt("Make your own guess first, then see what v3 thinks — the percentages, why this pick, and the full breakdown.") }), _jsxs("button", { type: "button", onClick: stop(() => setPhase('loading')), className: "mt-1 h-12 px-6 inline-flex items-center gap-2 rounded-2xl bg-accent text-bg font-extrabold hover:brightness-105 active:scale-[0.98] transition", children: [_jsx(Eye, {}), " ", tt("Reveal prediction")] }), _jsx("button", { type: "button", onClick: stop(() => setGuessFirst(false)), className: "text-xs text-faint hover:text-ink underline underline-offset-4", children: tt("Always show predictions") })] }));
}
/** Small version for match cards and the home page. `dark` = on the always-dark featured hero. */
export function RevealChip({ onReveal, dark = false }) {
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!busy)
            return;
        const t = setTimeout(onReveal, 750);
        return () => clearTimeout(t);
    }, [busy]);
    return (_jsxs("button", { type: "button", onClick: stop(() => setBusy(true)), disabled: busy, className: `relative overflow-hidden w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${dark ? 'bg-white/10 text-[#C8FF3D] border border-white/15 hover:bg-white/15' : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15'}`, children: [busy && _jsx("span", { "aria-hidden": true, className: "absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-current to-transparent opacity-20 animate-[scan_0.75s_linear_infinite]" }), busy ? _jsxs(_Fragment, { children: [_jsx(Spinner, { size: 15 }), " ", tt("Analysing…")] }) : _jsxs(_Fragment, { children: [_jsx(Eye, { size: 16 }), " ", tt("Reveal prediction")] })] }));
}
