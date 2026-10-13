import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorText, useAuth } from '../lib/auth';
import { safeNext } from '../lib/nav';
import { t } from '../lib/i18n';
import { TwoFactorStep } from '../components/TwoFactor';
/** Sign in and create account on one page: /login and /signup. */
export default function Login({ mode: initial }) {
    const { login, signup, user, needsVerification } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const next = safeNext(new URLSearchParams(loc.search).get('next'));
    const [mode, setMode] = useState(initial);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [optIn, setOptIn] = useState(false);
    const [adult, setAdult] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [ticket, setTicket] = useState(null); // password OK, two-step code still needed
    useEffect(() => setMode(initial), [initial]);
    useEffect(() => {
        if (!user)
            return;
        const target = next;
        if (needsVerification)
            nav(`/verify?next=${encodeURIComponent(target)}`, { replace: true });
        else
            nav(target, { replace: true });
    }, [user, needsVerification, next, nav]);
    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        if (mode === 'signup' && password.length < 8)
            return setError(t("Password must be at least 8 characters."));
        if (mode === 'signup' && !adult)
            return setError(t("Please confirm you are 18 or older and accept the terms."));
        setBusy(true);
        try {
            if (mode === 'login') {
                const step = await login(email, password);
                if (step.ticket) {
                    setTicket(step.ticket);
                    setPassword('');
                }
            }
            else
                await signup(email, password, name, optIn, adult);
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    };
    const input = 'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
    return (_jsx("div", { className: "max-w-md mx-auto px-4 sm:px-6 py-12 sm:py-16", children: _jsx("div", { className: "card p-6 sm:p-8", children: ticket ? (_jsxs(_Fragment, { children: [_jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: t("Two-step login") }), _jsx(TwoFactorStep, { ticket: ticket, onDone: () => setTicket(null), onCancel: () => setTicket(null) })] })) : (_jsxs(_Fragment, { children: [_jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: mode === 'login' ? t("Sign in") : t("Create your account") }), _jsx("p", { className: "text-sm text-muted mt-1", children: mode === 'login' ? t("Welcome back.") : t("Free account: every match, live scores, the model’s pick and 2 full predictions a week.") }), _jsxs("form", { onSubmit: submit, className: "mt-6 space-y-3", children: [mode === 'signup' && (_jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: t("Name (optional)") }), _jsx("input", { className: `${input} mt-1`, value: name, onChange: e => setName(e.target.value), autoComplete: "name", autoCapitalize: "words", maxLength: 80 })] })), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: t("Email") }), _jsx("input", { className: `${input} mt-1`, type: "email", required: true, value: email, onChange: e => setEmail(e.target.value), autoComplete: "email", inputMode: "email", autoCapitalize: "none", autoCorrect: "off", spellCheck: false })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: t("Password") }), _jsxs("div", { className: "relative mt-1", children: [_jsx("input", { className: `${input} pr-16`, type: showPw ? 'text' : 'password', required: true, minLength: mode === 'signup' ? 8 : undefined, value: password, onChange: e => setPassword(e.target.value), autoComplete: mode === 'login' ? 'current-password' : 'new-password', autoCapitalize: "none", autoCorrect: "off", spellCheck: false }), _jsx("button", { type: "button", onClick: () => setShowPw(v => !v), "aria-pressed": showPw, className: "absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-ink", children: showPw ? t("Hide") : t("Show") })] }), mode === 'signup' && _jsx("span", { className: "text-[11px] text-faint", children: t("At least 8 characters.") })] }), mode === 'signup' && (_jsxs("label", { className: "flex items-start gap-2.5 text-sm text-muted cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: optIn, onChange: e => setOptIn(e.target.checked), className: "mt-0.5 w-4 h-4 shrink-0 accent-[rgb(var(--accent))]" }), _jsx("span", { children: t("Email me about new features, Premium and weekly picks. You can turn this off anytime.") })] })), mode === 'signup' && (_jsxs("label", { className: "flex items-start gap-2.5 text-sm text-muted cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", required: true, checked: adult, onChange: e => setAdult(e.target.checked), className: "mt-0.5 w-4 h-4 shrink-0 accent-[rgb(var(--accent))]" }), _jsxs("span", { children: [t("I am 18 or older and I accept the"), ' ', _jsx(Link, { to: "/terms", target: "_blank", className: "text-accent hover:underline", children: t("Terms of use") }), ' ', t("and the"), ' ', _jsx(Link, { to: "/privacy", target: "_blank", className: "text-accent hover:underline", children: t("Privacy policy") }), "."] })] })), error && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: error }), _jsx("button", { type: "submit", disabled: busy, className: "w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60 transition-opacity", children: busy ? t("Please wait…") : mode === 'login' ? t("Sign in") : t("Create account") })] }), _jsx("div", { className: "mt-5 text-sm text-muted text-center", children: mode === 'login' ? (_jsxs(_Fragment, { children: [t("New here?"), ' ', _jsx(Link, { to: `/signup${loc.search}`, className: "text-accent font-medium", children: t("Create an account") })] })) : (_jsxs(_Fragment, { children: [t("Already have an account?"), ' ', _jsx(Link, { to: `/login${loc.search}`, className: "text-accent font-medium", children: t("Sign in") })] })) }), mode === 'login' && (_jsx("p", { className: "mt-3 text-xs text-center", children: _jsx(Link, { to: "/forgot", className: "text-muted hover:text-ink", children: t("Forgot your password?") }) }))] })) }) }));
}
