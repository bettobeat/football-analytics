import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { useAuth, errorText } from '../lib/auth';
import { t } from '../lib/i18n';
const KEY = 'b2b-assistant';
const SUGGEST_MATCH = [t("Why this pick?"), t("Is this a safe pick?"), t("How are the two teams doing lately?"), t("Who is missing?")];
const SUGGEST_SITE = [t("How do your predictions work?"), t("What does Premium include?"), t("How is your record counted?"), t("How do favorites work?")];
function readSaved() {
    try {
        const raw = sessionStorage.getItem(KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.slice(-30) : [];
    }
    catch {
        return [];
    }
}
/** Minimal formatting: paragraphs, **bold**, "- " lists. */
function Text({ text }) {
    const lines = text.split('\n');
    const render = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? _jsx("strong", { className: "font-semibold text-ink", children: part.slice(2, -2) }, i) : _jsx("span", { children: part }, i));
    const out = [];
    let list = [];
    const flush = () => {
        if (list.length)
            out.push(_jsx("ul", { className: "list-disc pl-4 space-y-0.5", children: list.map((x, i) => _jsx("li", { children: render(x) }, i)) }, `l${out.length}`));
        list = [];
    };
    lines.forEach((ln, i) => {
        const m = ln.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
        if (m)
            list.push(m[1]);
        else {
            flush();
            if (ln.trim())
                out.push(_jsx("p", { children: render(ln) }, i));
        }
    });
    flush();
    return _jsx("div", { className: "space-y-1.5", children: out });
}
export default function Assistant() {
    const { user, loading } = useAuth();
    const loc = useLocation();
    const [open, setOpen] = useState(false);
    const [available, setAvailable] = useState(null);
    const [msgs, setMsgs] = useState(() => readSaved());
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const matchId = (() => {
        const m = loc.pathname.match(/^\/match\/(\d+)/);
        return m ? Number(m[1]) : null;
    })();
    useEffect(() => {
        axios.get(`${API_URL}/assistant/status`).then(r => setAvailable(!!r.data.data?.available)).catch(() => setAvailable(false));
    }, []);
    useEffect(() => {
        try {
            sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
        }
        catch {
            /* ignore */
        }
        if (listRef.current)
            listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [msgs, open]);
    useEffect(() => {
        if (open)
            setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);
    // hidden on sign-in pages and while the assistant is not set up
    if (available === false || loading)
        return null;
    if (['/login', '/signup', '/verify', '/forgot'].includes(loc.pathname))
        return null;
    const send = async (text) => {
        const q = text.trim();
        if (!q || busy)
            return;
        const next = [...msgs, { role: 'user', content: q }];
        setMsgs(next);
        setInput('');
        setError(null);
        setBusy(true);
        try {
            const r = await axios.post(`${API_URL}/assistant/chat`, { messages: next.slice(-12), matchId, page: loc.pathname }, { timeout: 60000 });
            setMsgs([...next, { role: 'assistant', content: r.data.data.reply }]);
        }
        catch (e) {
            setError(errorText(e, t("The assistant could not answer right now.")));
        }
        finally {
            setBusy(false);
        }
    };
    const onSubmit = (e) => {
        e.preventDefault();
        send(input);
    };
    const suggestions = matchId ? SUGGEST_MATCH : SUGGEST_SITE;
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", onClick: () => setOpen(o => !o), "aria-label": open ? t("Close the assistant") : t("Ask the assistant"), className: `fixed z-40 right-4 bottom-24 lg:bottom-6 lg:right-6 h-12 px-4 rounded-full shadow-lift border border-accent/40 bg-accent text-bg font-bold text-sm inline-flex items-center gap-2 transition-transform hover:scale-[1.03] ${open ? 'hidden lg:inline-flex' : ''}`, children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: _jsx("path", { d: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" }) }), t("Ask")] }), open && (_jsxs("div", { role: "dialog", "aria-label": t("Assistant"), className: "fixed z-50 inset-x-0 bottom-0 top-14 sm:top-auto sm:inset-x-auto sm:right-4 sm:bottom-24 lg:right-6 lg:bottom-6 sm:w-[380px] sm:h-[560px] sm:max-h-[calc(100vh-7rem)] flex flex-col rounded-t-3xl sm:rounded-3xl border border-line bg-surface shadow-lift overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-3 px-4 py-3 border-b border-line/70 bg-surface2/50", children: [_jsx("span", { className: "w-8 h-8 rounded-full bg-accent text-bg grid place-items-center font-display font-extrabold", children: "B" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "font-display font-bold text-ink leading-tight", children: t("Ask SportLikely") }), _jsx("div", { className: "text-[11px] text-faint truncate", children: matchId ? t("Knows this match: our prediction, form, line-ups, H2H") : t("About our predictions, the site and football") })] }), msgs.length > 0 && (_jsx("button", { type: "button", onClick: () => setMsgs([]), className: "text-xs text-faint hover:text-ink", title: t("Start a new conversation"), children: t("Clear") })), _jsx("button", { type: "button", onClick: () => setOpen(false), className: "w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-surface2", "aria-label": t("Close"), children: "\u00D7" })] }), _jsx("div", { ref: listRef, className: "flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm", children: !user ? (_jsx("div", { className: "h-full grid place-items-center text-center", children: _jsxs("div", { className: "space-y-3", children: [_jsx("p", { className: "text-muted", children: t("Sign in to ask about any match, our picks or the site.") }), _jsx(Link, { to: `/login?next=${encodeURIComponent(loc.pathname)}`, className: "inline-block h-10 px-4 rounded-xl bg-accent text-bg font-bold grid place-items-center", children: t("Sign in") })] }) })) : (_jsxs(_Fragment, { children: [msgs.length === 0 && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "rounded-2xl rounded-tl-md bg-surface2/70 px-3.5 py-2.5 text-muted", children: [t("Hi"), user.name ? ` ${user.name.split(' ')[0]}` : '', t("! Ask me why we picked a team, what the numbers mean, or anything about football.")] }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: suggestions.map(s => (_jsx("button", { type: "button", onClick: () => send(s), className: "px-3 py-1.5 rounded-full border border-line text-xs text-ink hover:border-accent/60 hover:text-accent", children: s }, s))) })] })), msgs.map((m, i) => (_jsx("div", { className: `flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`, children: _jsx("div", { className: `max-w-[88%] px-3.5 py-2.5 rounded-2xl ${m.role === 'user' ? 'bg-accent text-bg rounded-tr-md' : 'bg-surface2/70 text-ink rounded-tl-md'}`, children: m.role === 'user' ? m.content : _jsx(Text, { text: m.content }) }) }, i))), busy && (_jsx("div", { className: "flex justify-start", children: _jsx("div", { className: "px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-surface2/70 text-faint", children: _jsxs("span", { className: "inline-flex gap-1", children: [_jsx("span", { className: "animate-pulseDot", children: "\u00B7" }), _jsx("span", { className: "animate-pulseDot [animation-delay:150ms]", children: "\u00B7" }), _jsx("span", { className: "animate-pulseDot [animation-delay:300ms]", children: "\u00B7" })] }) }) })), error && _jsx("div", { className: "text-xs text-loss", children: error }), msgs.length > 0 && !busy && (_jsx("div", { className: "flex flex-wrap gap-1.5 pt-1", children: suggestions.filter(s => !msgs.some(m => m.content === s)).slice(0, 2).map(s => (_jsx("button", { type: "button", onClick: () => send(s), className: "px-2.5 py-1 rounded-full border border-line/70 text-[11px] text-muted hover:border-accent/60 hover:text-accent", children: s }, s))) }))] })) }), user && (_jsxs("form", { onSubmit: onSubmit, className: "p-3 border-t border-line/70 flex items-center gap-2", children: [_jsx("input", { ref: inputRef, value: input, onChange: e => setInput(e.target.value), placeholder: matchId ? t("Ask about this match…") : t("Ask anything about football…"), maxLength: 1000, className: "flex-1 h-11 px-3.5 rounded-xl bg-surface2/70 border border-line/70 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent/60" }), _jsx("button", { type: "submit", disabled: busy || !input.trim(), className: "h-11 px-4 rounded-xl bg-accent text-bg font-bold text-sm disabled:opacity-40", children: t("Send") })] })), _jsx("div", { className: "px-4 pb-2 text-[10px] text-faint", children: t("Probabilities, not promises. No betting advice. 18+.") })] }))] }));
}
