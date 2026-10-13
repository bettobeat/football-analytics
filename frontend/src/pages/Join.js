import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import { t as tt } from '../lib/i18n';
const dateOf = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
export default function Join() {
    const { code = '' } = useParams();
    const { user, loading, tester, needsVerification, refresh } = useAuth();
    const [info, setInfo] = useState(undefined);
    const [until, setUntil] = useState(null);
    const [error, setError] = useState(null);
    const tried = useRef(false);
    useEffect(() => { document.title = tt("You're invited · SportLikely"); }, []);
    useEffect(() => {
        axios.get(`${API_URL}/testers/invite/${encodeURIComponent(code)}`).then(r => setInfo(r.data.data)).catch(() => setInfo(null));
    }, [code]);
    // signed in: join straight away (once)
    useEffect(() => {
        if (!user || !info?.valid || tester || tried.current)
            return;
        tried.current = true;
        axios.post(`${API_URL}/testers/join`, { code })
            .then(async (r) => { setUntil(r.data.data.until); await refresh(); })
            .catch(e => setError(errorText(e)));
    }, [user, info, tester]);
    if (loading || info === undefined)
        return null;
    const next = encodeURIComponent(`/join/${code}`);
    const box = (children) => (_jsx("div", { className: "max-w-lg mx-auto px-4 py-14", children: _jsx("div", { className: "card p-6 sm:p-8 space-y-4 text-center", children: children }) }));
    const done = until || tester?.until;
    if (done)
        return box(_jsxs(_Fragment, { children: [_jsx("div", { className: "mx-auto w-12 h-12 rounded-2xl bg-accent/15 text-accent grid place-items-center text-2xl", "aria-hidden": true, children: "\u2713" }), _jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: tt("You're a SportLikely tester") }), _jsx("p", { className: "text-sm text-muted", children: tt("You have Pro until {0}: every prediction in full, draw picks and upset watch.", { 0: dateOf(done) }) }), needsVerification && (_jsxs("p", { className: "text-sm text-draw font-semibold", children: [tt("Confirm your email to switch Pro on."), " ", _jsx(Link, { to: "/verify", className: "underline", children: tt("Confirm now") })] })), _jsxs("div", { className: "rounded-xl border border-line bg-surface2/50 p-4 text-left text-sm text-ink space-y-1.5", children: [_jsx("p", { className: "font-semibold", children: tt("How to help us") }), _jsx("p", { className: "text-muted", children: tt("Use the site like you normally would before and after matches. Whenever something is broken, confusing or missing — or you like something — press the Feedback button at the bottom right of every page. Short is fine.") })] }), _jsx(Link, { to: "/", className: "inline-block rounded-xl bg-accent text-bg font-semibold px-5 py-2.5 text-sm", children: tt("Start") })] }));
    if (!info || !info.valid)
        return box(_jsxs(_Fragment, { children: [_jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: tt("This invite link doesn't work") }), _jsx("p", { className: "text-sm text-muted", children: !info ? tt("The link is not valid. Check that you copied all of it.") : info.full ? tt("All places on this invite are taken.") : tt("This invite has been closed.") }), _jsxs(Link, { to: "/", className: "inline-block text-sm font-semibold text-accent", children: [tt("Go to SportLikely"), " \u2192"] })] }));
    if (user)
        return box(error ? _jsxs(_Fragment, { children: [_jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: tt("Couldn't join") }), _jsx("p", { className: "text-sm text-loss", children: error })] }) : _jsx("p", { className: "text-sm text-muted", children: tt("Joining…") }));
    return box(_jsxs(_Fragment, { children: [_jsx("div", { className: "text-[11px] font-bold uppercase tracking-[0.16em] text-accent", children: tt("Beta tester invite") }), _jsx("h1", { className: "font-display text-3xl font-extrabold text-ink", children: tt("Help us test SportLikely") }), _jsx("p", { className: "text-sm text-muted", children: tt("Get Pro free for {0} days — every prediction in full, draw picks and upset watch. No card needed. In return, tell us what works and what doesn't.", { 0: info.days }) }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-2 justify-center pt-2", children: [_jsx(Link, { to: `/signup?next=${next}`, className: "rounded-xl bg-accent text-bg font-semibold px-5 py-2.5 text-sm", children: tt("Create a free account") }), _jsx(Link, { to: `/login?next=${next}`, className: "rounded-xl border border-line text-ink font-semibold px-5 py-2.5 text-sm", children: tt("I already have an account") })] })] }));
}
