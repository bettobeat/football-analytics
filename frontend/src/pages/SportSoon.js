import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { t, lang } from '../lib/i18n';
import { SPORTS } from '../lib/sports';
const PLAN = {
    basketball: {
        leagues: ['NBA', 'EuroLeague', 'EuroCup', 'Liga ACB (Spain)', 'Basketbol Süper Ligi (Turkey)', 'Lega Basket Serie A (Italy)', 'LNB Pro A (France)', 'Greek Basket League', 'Basketball Bundesliga', 'Basketball Champions League', 'ABA League', 'LKL (Lithuania)', 'FIBA Europe Cup', 'NBL (Australia)', 'B.League (Japan)', 'CBA (China)', 'NBB (Brazil)', 'BSN (Puerto Rico)'],
        picks: [t('Who wins, with the chance of each side'), t('Point spread and total points'), t('Player form, injuries and rest days')]
    },
    tennis: {
        leagues: ['ATP', 'WTA', 'Grand Slams'],
        picks: [t('Who wins, with the chance of each player'), t('Number of sets and games'), t('Form on each surface: hard, clay and grass')]
    },
    'american-football': {
        leagues: ['NFL', 'College football (NCAA)'],
        picks: [t('Who wins, with the chance of each side'), t('Point spread and total points'), t('Quarterback and key-player availability')]
    }
};
/** "Coming soon" page of a sport we are still building, with a "tell me when it opens" sign-up. */
export default function SportSoon({ sport }) {
    const info = SPORTS.find(s => s.id === sport);
    const plan = PLAN[sport];
    const { user } = useAuth();
    const [email, setEmail] = useState('');
    const [state, setState] = useState('idle');
    const [error, setError] = useState(null);
    useEffect(() => { if (user?.email)
        setEmail(user.email); }, [user?.email]);
    useEffect(() => { setState('idle'); setError(null); }, [sport]);
    useEffect(() => { document.title = t('{0} · SportLikely', { 0: info.name }); }, [info.name]);
    const submit = async (e) => {
        e.preventDefault();
        setState('busy');
        setError(null);
        try {
            await axios.post(`${API_URL}/waitlist`, { email, sport, lang });
            setState('done');
        }
        catch (err) {
            setError(err?.response?.data?.error ? t(err.response.data.error) : t('Something went wrong. Please try again.'));
            setState('error');
        }
    };
    return (_jsx("div", { className: "max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16", children: _jsxs("div", { className: "card relative overflow-hidden p-6 sm:p-10", children: [_jsx("div", { className: "pointer-events-none absolute -right-16 -top-16 text-[180px] sm:text-[240px] leading-none opacity-[0.07] select-none", "aria-hidden": true, children: info.icon }), _jsx("span", { className: "inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-accent/15 text-accent", children: t('Coming soon') }), _jsxs("h1", { className: "mt-4 font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-ink", children: [_jsx("span", { "aria-hidden": true, className: "mr-2", children: info.icon }), t('{0} predictions', { 0: info.name })] }), _jsx("p", { className: "mt-3 text-muted max-w-xl", children: t('We are building a model for {0}, the same way we built football: tested on past seasons first, then every prediction saved before the game and checked in public.', { 0: info.name }) }), _jsxs("div", { className: "mt-8 grid sm:grid-cols-2 gap-4", children: [_jsxs("div", { className: "rounded-2xl border border-line/70 bg-surface2/40 p-4", children: [_jsx("div", { className: "label mb-2", children: t('Competitions') }), _jsx("ul", { className: "space-y-1.5 text-sm text-ink", children: plan.leagues.map(l => _jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent", "aria-hidden": true }), l] }, l)) })] }), _jsxs("div", { className: "rounded-2xl border border-line/70 bg-surface2/40 p-4", children: [_jsx("div", { className: "label mb-2", children: t('What you will get') }), _jsx("ul", { className: "space-y-1.5 text-sm text-ink", children: plan.picks.map(p => _jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent", "aria-hidden": true }), p] }, p)) })] })] }), _jsxs("div", { className: "mt-8 rounded-2xl border border-accent/40 bg-accent/5 p-5", children: [_jsx("div", { className: "font-display font-bold text-ink", children: t('Tell me when it opens') }), _jsx("p", { className: "text-sm text-muted mt-1", children: t('One email on the day it opens. Nothing else.') }), state === 'done' ? (_jsx("p", { className: "mt-4 text-sm font-semibold text-win", children: t("You're on the list. We'll email you when {0} opens.", { 0: info.name }) })) : (_jsxs("form", { onSubmit: submit, className: "mt-4 flex flex-col sm:flex-row gap-2", children: [_jsx("input", { type: "email", required: true, value: email, onChange: e => setEmail(e.target.value), placeholder: t('Your email'), "aria-label": t('Your email'), className: "flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent" }), _jsx("button", { type: "submit", disabled: state === 'busy', className: "rounded-xl bg-accent text-bg font-semibold px-5 py-2.5 text-sm disabled:opacity-60", children: state === 'busy' ? t('Saving…') : t('Notify me') })] })), error && _jsx("p", { className: "mt-2 text-sm text-loss", children: error })] }), _jsx("div", { className: "mt-8 text-sm", children: _jsx(Link, { to: "/", className: "font-semibold text-accent", children: t('⚽ Football predictions are live now →') }) })] }) }));
}
