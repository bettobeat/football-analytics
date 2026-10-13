import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import { t as tt } from '../lib/i18n';
/* Contact us: the message goes to our support inbox; we answer by email. */
const TOPICS = [
    { k: 'question', label: 'A question' },
    { k: 'account', label: 'Account / sign-in' },
    { k: 'billing', label: 'Billing / my plan' },
    { k: 'privacy', label: 'Privacy / my data' },
    { k: 'bug', label: 'Something is broken' },
    { k: 'idea', label: 'Idea / feedback' },
    { k: 'business', label: 'Business / partnership' },
    { k: 'other', label: 'Other' }
];
export default function Contact() {
    const { user } = useAuth();
    const loc = useLocation();
    const params = new URLSearchParams(loc.search);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [topic, setTopic] = useState(TOPICS.some(x => x.k === params.get('topic')) ? params.get('topic') : 'question');
    const [message, setMessage] = useState('');
    const [website, setWebsite] = useState(''); // honeypot, hidden from people
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(false);
    const startedAt = useRef(Date.now());
    useEffect(() => { document.title = tt("Contact us · SportLikely"); }, []);
    useEffect(() => { if (user?.name && !name)
        setName(user.name); }, [user]);
    const input = 'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        if (message.trim().length < 10)
            return setError(tt("Please write a little more (at least 10 characters)."));
        setBusy(true);
        try {
            await axios.post(`${API_URL}/contact`, {
                name, email: user ? undefined : email, topic, message, website, startedAt: startedAt.current, page: params.get('from') || undefined
            });
            setSent(true);
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-14", children: [_jsx("h1", { className: "font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink", children: tt("Contact us") }), _jsx("p", { className: "text-muted mt-2", children: tt("Questions, problems, ideas: write to us and we answer by email, usually within 1–2 working days.") }), sent ? (_jsxs("div", { className: "card p-6 sm:p-8 mt-8 text-center space-y-3", children: [_jsx("div", { className: "w-12 h-12 mx-auto rounded-2xl bg-win/15 text-win grid place-items-center", children: _jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: _jsx("path", { d: "M5 12l5 5L20 7" }) }) }), _jsx("div", { className: "font-display text-xl font-bold text-ink", children: tt("Message sent") }), _jsx("p", { className: "text-sm text-muted", children: tt("Thanks! We will reply to {0}.", { 0: user?.email || email }) }), _jsx(Link, { to: "/", className: "inline-block mt-2 text-sm font-bold text-accent", children: tt("Back to home") })] })) : (_jsxs("form", { onSubmit: submit, className: "card relative p-6 sm:p-8 mt-8 space-y-4", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: tt("Name (optional)") }), _jsx("input", { className: `${input} mt-1`, value: name, onChange: e => setName(e.target.value), autoComplete: "name", autoCapitalize: "words", maxLength: 80 })] }), user ? (_jsxs("div", { className: "text-sm text-muted", children: [tt("We will reply to"), " ", _jsx("span", { className: "text-ink font-semibold", children: user.email })] })) : (_jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: tt("Your email") }), _jsx("input", { className: `${input} mt-1`, type: "email", required: true, value: email, onChange: e => setEmail(e.target.value), autoComplete: "email", inputMode: "email", autoCapitalize: "none", autoCorrect: "off", spellCheck: false })] })), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: tt("Topic") }), _jsx("select", { className: `${input} mt-1`, value: topic, onChange: e => setTopic(e.target.value), children: TOPICS.map(x => _jsx("option", { value: x.k, children: tt(x.label) }, x.k)) })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: tt("Message") }), _jsx("textarea", { className: `${input} mt-1 min-h-[150px] resize-y`, required: true, value: message, onChange: e => setMessage(e.target.value), maxLength: 5000 }), _jsxs("span", { className: "text-[11px] text-faint", children: [message.length, "/5000"] })] }), _jsx("div", { "aria-hidden": "true", className: "absolute -left-[9999px] w-px h-px overflow-hidden", children: _jsxs("label", { children: ["Website", _jsx("input", { tabIndex: -1, autoComplete: "off", value: website, onChange: e => setWebsite(e.target.value) })] }) }), error && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: error }), _jsx("button", { type: "submit", disabled: busy, className: "w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60", children: busy ? tt("Sending…") : tt("Send message") }), _jsxs("p", { className: "text-[11px] text-faint", children: [tt("We use your message only to answer you. See our"), ' ', _jsx(Link, { to: "/privacy", className: "text-accent hover:underline", children: tt("Privacy policy") }), "."] })] })), _jsxs("p", { className: "text-xs text-faint mt-6 text-center", children: [tt("Prefer email? Write to"), ' ', _jsx("a", { href: "mailto:support@sportlikely.com", className: "text-accent hover:underline", children: "support@sportlikely.com" })] })] }));
}
