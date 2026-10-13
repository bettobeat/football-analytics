import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import { t as tt } from '../lib/i18n';
/* Feedback button for beta testers (and staff): bottom right on every page; lands in the CRM support inbox. */
const KINDS = [
    { k: 'bug', label: 'Something is broken' },
    { k: 'confusing', label: 'Confusing' },
    { k: 'idea', label: 'Idea' },
    { k: 'like', label: 'I like this' }
];
export default function FeedbackButton() {
    const { user, tester, staff } = useAuth();
    const loc = useLocation();
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState('bug');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(false);
    useEffect(() => {
        if (!open)
            return;
        const esc = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        document.addEventListener('keydown', esc);
        return () => document.removeEventListener('keydown', esc);
    }, [open]);
    if (!user || (!tester && !staff))
        return null;
    const send = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const w = window.innerWidth;
        const device = `${w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'computer'} ${w}px`;
        try {
            await axios.post(`${API_URL}/feedback`, { kind, message: msg, page: loc.pathname + loc.search, device });
            setSent(true);
            setMsg('');
            setTimeout(() => { setOpen(false); setSent(false); }, 1800);
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "fixed right-3 bottom-[4.6rem] xl:right-4 xl:bottom-5 z-40", children: [open && (_jsx("form", { onSubmit: send, className: "menu-panel absolute right-0 bottom-12 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-line p-4 space-y-3 shadow-lift", children: sent ? (_jsx("p", { className: "text-sm text-win font-semibold py-6 text-center", children: tt("Thank you! We read every message.") })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-display font-bold text-ink", children: tt("Feedback") }), _jsx("button", { type: "button", onClick: () => setOpen(false), className: "text-muted hover:text-ink text-lg leading-none", "aria-label": tt("Close"), children: "\u00D7" })] }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: KINDS.map(k => (_jsx("button", { type: "button", onClick: () => setKind(k.k), className: `rounded-full px-3 py-1 text-xs font-semibold border ${kind === k.k ? 'bg-accent text-bg border-accent' : 'border-line text-muted hover:text-ink'}`, children: tt(k.label) }, k.k))) }), _jsx("textarea", { value: msg, onChange: e => setMsg(e.target.value), rows: 4, maxLength: 3000, required: true, autoFocus: true, placeholder: tt("What happened, or what would make it better?"), className: "w-full rounded-xl border border-line bg-surface2/60 px-3 py-2 text-sm text-ink placeholder:text-faint outline-none focus:border-accent" }), _jsx("p", { className: "text-[11px] text-faint", children: tt("We also get the page you're on.") }), error && _jsx("p", { className: "text-xs text-loss", children: error }), _jsx("button", { type: "submit", disabled: busy || msg.trim().length < 3, className: "w-full rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: busy ? tt("Sending…") : tt("Send") })] })) })), _jsxs("button", { type: "button", onClick: () => setOpen(o => !o), "aria-expanded": open, className: "h-9 w-9 xl:w-auto xl:h-10 xl:px-4 rounded-full bg-accent text-bg font-bold text-sm shadow-lift inline-flex items-center justify-center gap-2 opacity-90 xl:opacity-100", "aria-label": tt("Feedback"), children: [_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: _jsx("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) }), _jsx("span", { className: "hidden xl:inline", children: tt("Feedback") })] })] }));
}
