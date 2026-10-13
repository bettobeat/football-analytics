import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
import { TwoFactorStep } from '../components/TwoFactor';
/** Forgot password: email → 6-digit code + new password → signed in. */
export default function Forgot() {
    const { resetPassword, user } = useAuth();
    const nav = useNavigate();
    const [step, setStep] = useState('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [ticket, setTicket] = useState(null); // new password saved; two-step code still needed
    useEffect(() => {
        if (user && step === 'email')
            nav('/account', { replace: true });
    }, [user, step, nav]);
    const input = 'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
    const sendCode = async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await axios.post(`${API_URL}/auth/forgot`, { email });
            setStep('code');
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    };
    const reset = async (e) => {
        e.preventDefault();
        setError(null);
        if (password.length < 8)
            return setError(t("Password must be at least 8 characters."));
        setBusy(true);
        try {
            const r = await resetPassword(email, code, password);
            if (r.ticket) {
                setTicket(r.ticket);
                return;
            }
            nav('/', { replace: true });
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx("div", { className: "max-w-md mx-auto px-4 sm:px-6 py-12 sm:py-16", children: _jsxs("div", { className: "card p-6 sm:p-8", children: [_jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: ticket ? t("Two-step login") : t("Reset your password") }), ticket ? (_jsx(TwoFactorStep, { ticket: ticket, onDone: () => nav('/', { replace: true }), onCancel: () => nav('/login', { replace: true }) })) : step === 'email' ? (_jsxs("form", { onSubmit: sendCode, className: "mt-6 space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: t("Enter your account email and we’ll send you a 6-digit code.") }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: t("Email") }), _jsx("input", { className: `${input} mt-1`, type: "email", required: true, value: email, onChange: e => setEmail(e.target.value), autoComplete: "email", inputMode: "email", autoCapitalize: "none", autoCorrect: "off", spellCheck: false })] }), error && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: error }), _jsx("button", { type: "submit", disabled: busy, className: "w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60", children: busy ? t("Sending…") : t("Send code") })] })) : (_jsxs("form", { onSubmit: reset, className: "mt-6 space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: t("If an account exists for {0}, a code is on its way. It’s valid for 10 minutes.", { 0: email }) }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: t("Code") }), _jsx("input", { className: `${input} mt-1 num text-center text-xl tracking-[0.4em]`, value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), inputMode: "numeric", autoComplete: "one-time-code", placeholder: "000000", required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: t("New password") }), _jsx("input", { className: `${input} mt-1`, type: "password", required: true, minLength: 8, value: password, onChange: e => setPassword(e.target.value), autoComplete: "new-password" })] }), error && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: error }), _jsx("button", { type: "submit", disabled: busy || code.length !== 6, className: "w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60", children: busy ? t("Saving…") : t("Set new password") }), _jsx("button", { type: "button", onClick: () => setStep('email'), className: "w-full text-sm text-muted hover:text-ink", children: t("Use a different email") })] })), _jsx("p", { className: "mt-5 text-sm text-center", children: _jsx(Link, { to: "/login", className: "text-muted hover:text-ink", children: t("Back to sign in") }) })] }) }));
}
