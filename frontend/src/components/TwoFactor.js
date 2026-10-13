import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
const input = 'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
/** Sign-in step 2: the 6-digit code from the authenticator app (or a recovery code). */
export function TwoFactorStep({ ticket, onDone, onCancel }) {
    const { loginCode } = useAuth();
    const [code, setCode] = useState('');
    const [recovery, setRecovery] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const submit = async (e) => {
        e?.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await loginCode(ticket, code);
            onDone();
        }
        catch (err) {
            setError(errorText(err));
            setCode('');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("form", { onSubmit: submit, className: "mt-6 space-y-3", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "w-10 h-10 rounded-xl bg-accent/15 text-accent grid place-items-center shrink-0", children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }), _jsx("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" })] }) }), _jsx("p", { className: "text-sm text-muted", children: recovery ? t("Enter one of your recovery codes. Each code works once.") : t("Open your authenticator app and enter the 6-digit code for SportLikely.") })] }), recovery ? (_jsx("input", { className: input, value: code, onChange: e => setCode(e.target.value), placeholder: "xxxxx-xxxxx", autoComplete: "off", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, autoFocus: true, "aria-label": t("Recovery code") })) : (_jsx("input", { className: "w-full rounded-xl border border-line bg-surface2/60 px-4 py-3 text-center num text-3xl tracking-[0.45em] text-ink placeholder:text-faint/60 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20", value: code, onChange: e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCode(v);
                }, inputMode: "numeric", autoComplete: "one-time-code", placeholder: "000000", autoFocus: true, "aria-label": t("6-digit code") })), error && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: error }), _jsx("button", { type: "submit", disabled: busy || (recovery ? code.trim().length < 8 : code.length !== 6), className: "w-full rounded-xl bg-accent text-bg font-semibold py-2.5 text-sm disabled:opacity-60", children: busy ? t("Checking…") : t("Sign in") }), _jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsx("button", { type: "button", onClick: () => { setRecovery(v => !v); setCode(''); setError(null); }, className: "text-accent font-medium", children: recovery ? t("Use the app code instead") : t("Lost your phone? Use a recovery code") }), _jsx("button", { type: "button", onClick: onCancel, className: "text-muted hover:text-ink", children: t("Back") })] })] }));
}
function RecoveryCodes({ codes, onDone }) {
    const [saved, setSaved] = useState(false);
    const text = `SportLikely recovery codes (each works once)\n\n${codes.join('\n')}\n`;
    const download = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = 'sportlikely-recovery-codes.txt';
        a.click();
        URL.revokeObjectURL(a.href);
        setSaved(true);
    };
    return (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "rounded-xl border border-draw/40 bg-draw/10 px-3 py-2 text-sm text-ink", children: t("Save these recovery codes somewhere safe (not on the same phone). If you lose your phone, each code lets you sign in once. They are shown only now.") }), _jsx("div", { className: "grid grid-cols-2 gap-2 rounded-xl bg-surface2/60 border border-line p-3 num text-sm text-ink", children: codes.map(c => _jsx("span", { className: "text-center", children: c }, c)) }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", onClick: download, className: "rounded-xl bg-surface2 border border-line px-3 py-2 text-sm font-semibold text-ink", children: t("Download") }), _jsx("button", { type: "button", onClick: () => { navigator.clipboard?.writeText(text).then(() => setSaved(true)).catch(() => undefined); }, className: "rounded-xl bg-surface2 border border-line px-3 py-2 text-sm font-semibold text-ink", children: t("Copy") })] }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-muted cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: saved, onChange: e => setSaved(e.target.checked), className: "w-4 h-4 accent-[rgb(var(--accent))]" }), t("I saved my recovery codes")] }), _jsx("button", { type: "button", disabled: !saved, onClick: onDone, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-50", children: t("Done") })] }));
}
function QrBlock({ setup }) {
    return (_jsxs("div", { className: "flex flex-col sm:flex-row items-center gap-4", children: [setup.qr && _jsx("img", { src: setup.qr, alt: t("QR code for your authenticator app"), className: "w-[200px] h-[200px] rounded-xl bg-white p-2" }), _jsxs("div", { className: "text-sm space-y-2 min-w-0", children: [_jsx("div", { className: "label", children: t("Setup key") }), _jsx("div", { className: "num text-ink break-all select-all bg-surface2/60 border border-line rounded-xl px-3 py-2", children: setup.secret.match(/.{1,4}/g)?.join(' ') }), _jsx("a", { href: setup.otpauth, className: "inline-block text-accent font-semibold sm:hidden", children: t("Open in authenticator app") })] })] }));
}
/** Account page: switch two-step login on / off, new recovery codes. */
export function TwoFactorCard() {
    const { user, refresh } = useAuth();
    const [st, setSt] = useState(null);
    const [mode, setMode] = useState('idle');
    const [pw, setPw] = useState('');
    const [code, setCode] = useState('');
    const [setup, setSetup] = useState(null);
    const [codes, setCodes] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const load = () => axios.get(`${API_URL}/auth/2fa`).then(r => setSt(r.data.data)).catch(() => setSt(null));
    useEffect(() => { load(); }, []);
    const reset = () => { setMode('idle'); setPw(''); setCode(''); setSetup(null); setError(null); };
    const run = async (fn) => {
        setError(null);
        setBusy(true);
        try {
            await fn();
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    };
    const start = (e) => {
        e.preventDefault();
        run(async () => {
            const r = await axios.post(`${API_URL}/auth/2fa/setup`, { password: pw });
            const d = r.data.data;
            let qr;
            try {
                qr = await QRCode.toDataURL(d.otpauth, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
            }
            catch { /* the key below still works */ }
            setSetup({ ...d, qr });
            setPw('');
            setMode('scan');
        });
    };
    const confirm = (e) => {
        e.preventDefault();
        run(async () => {
            const r = await axios.post(`${API_URL}/auth/2fa/confirm`, { code });
            setCodes(r.data.data.recoveryCodes);
            setCode('');
            setMode('codes');
        });
    };
    const turnOff = (e) => {
        e.preventDefault();
        run(async () => {
            await axios.post(`${API_URL}/auth/2fa/disable`, { password: pw, code });
            reset();
            await load();
            await refresh();
        });
    };
    const addDevice = (e) => {
        e.preventDefault();
        run(async () => {
            const r = await axios.post(`${API_URL}/auth/2fa/device`, { password: pw, code });
            const d = r.data.data;
            let qr;
            try {
                qr = await QRCode.toDataURL(d.otpauth, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
            }
            catch { /* the key still works */ }
            setSetup({ ...d, qr });
            setPw('');
            setCode('');
            setMode('deviceScan');
        });
    };
    const newCodes = (e) => {
        e.preventDefault();
        run(async () => {
            const r = await axios.post(`${API_URL}/auth/2fa/recovery`, { code });
            setCodes(r.data.data.recoveryCodes);
            setCode('');
            setMode('codes');
        });
    };
    if (!user || !st)
        return null;
    const codeInput = (_jsx("input", { className: `${input} num tracking-widest`, value: code, onChange: e => setCode(e.target.value.slice(0, 20)), placeholder: t("6-digit code"), inputMode: "text", autoComplete: "one-time-code", "aria-label": t("6-digit code") }));
    const err = error && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: error });
    return (_jsxs("div", { className: "card p-6 space-y-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "font-display font-bold text-ink", children: t("Two-step login") }), _jsx("p", { className: "text-sm text-muted mt-0.5", children: t("After your password, a 6-digit code from an app on your phone. A stolen password alone is then not enough.") })] }), _jsx("span", { className: `shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${st.enabled ? 'bg-win/15 text-win' : 'bg-surface2 text-muted'}`, children: st.enabled ? t("On") : t("Off") })] }), mode === 'codes' ? (_jsx(RecoveryCodes, { codes: codes, onDone: async () => { reset(); setCodes([]); await load(); await refresh(); } })) : !st.enabled ? (mode === 'idle' ? (_jsx("button", { type: "button", onClick: () => setMode('password'), className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm", children: t("Set up two-step login") })) : mode === 'password' ? (_jsxs("form", { onSubmit: start, className: "space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: t("You need an authenticator app on your phone, for example Google Authenticator or Microsoft Authenticator. First, confirm your password.") }), _jsx("input", { className: input, type: "password", required: true, value: pw, onChange: e => setPw(e.target.value), autoComplete: "current-password", placeholder: t("Password"), "aria-label": t("Password") }), err, _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: busy || !pw, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: busy ? t("Please wait…") : t("Continue") }), _jsx("button", { type: "button", onClick: reset, className: "rounded-xl px-4 py-2 text-sm text-muted", children: t("Cancel") })] })] })) : setup ? (_jsxs("form", { onSubmit: confirm, className: "space-y-4", children: [_jsxs("ol", { className: "text-sm text-muted space-y-1 list-decimal pl-5", children: [_jsx("li", { children: t("In your authenticator app, tap + and choose \"Scan a QR code\".") }), _jsx("li", { children: t("Scan this code (or type the setup key below).") }), _jsx("li", { children: t("Enter the 6-digit code the app shows for SportLikely.") })] }), _jsx(QrBlock, { setup: setup }), _jsx("input", { className: "w-full max-w-[220px] rounded-xl border border-line bg-surface2/60 px-4 py-2.5 text-center num text-2xl tracking-[0.4em] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20", value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), inputMode: "numeric", autoComplete: "one-time-code", placeholder: "000000", "aria-label": t("6-digit code") }), err, _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: busy || code.length !== 6, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: busy ? t("Checking…") : t("Turn on") }), _jsx("button", { type: "button", onClick: reset, className: "rounded-xl px-4 py-2 text-sm text-muted", children: t("Cancel") })] }), _jsx("p", { className: "text-[11px] text-faint", children: t("Turning it on signs you out on every other device.") })] })) : null) : mode === 'off' ? (_jsxs("form", { onSubmit: turnOff, className: "space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: t("To switch it off, confirm your password and a code from your app (or a recovery code).") }), _jsx("input", { className: input, type: "password", required: true, value: pw, onChange: e => setPw(e.target.value), autoComplete: "current-password", placeholder: t("Password"), "aria-label": t("Password") }), codeInput, err, _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: busy || !pw || code.trim().length < 6, className: "rounded-xl bg-loss/90 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60", children: t("Switch off") }), _jsx("button", { type: "button", onClick: reset, className: "rounded-xl px-4 py-2 text-sm text-muted", children: t("Cancel") })] })] })) : mode === 'device' ? (_jsxs("form", { onSubmit: addDevice, className: "space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: t("Add a second phone or tablet: both will show the same codes. Confirm your password and a code from your current app.") }), _jsx("input", { className: input, type: "password", required: true, value: pw, onChange: e => setPw(e.target.value), autoComplete: "current-password", placeholder: t("Password"), "aria-label": t("Password") }), codeInput, err, _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: busy || !pw || code.trim().length < 6, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: t("Continue") }), _jsx("button", { type: "button", onClick: reset, className: "rounded-xl px-4 py-2 text-sm text-muted", children: t("Cancel") })] })] })) : mode === 'deviceScan' && setup ? (_jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-sm text-muted", children: t("On the other device, open your authenticator app, tap + and scan this code (or type the setup key). Both devices will then show the same 6-digit codes.") }), _jsx(QrBlock, { setup: setup }), _jsx("button", { type: "button", onClick: reset, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm", children: t("Done") })] })) : mode === 'newcodes' ? (_jsxs("form", { onSubmit: newCodes, className: "space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: t("New recovery codes replace the old ones. Enter a code from your app to continue.") }), codeInput, err, _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: busy || code.trim().length < 6, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: t("Get new codes") }), _jsx("button", { type: "button", onClick: reset, className: "rounded-xl px-4 py-2 text-sm text-muted", children: t("Cancel") })] })] })) : (_jsxs("div", { className: "space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: t("On since {0}. Recovery codes left: {1}.", { 0: st.enabledAt ? new Date(st.enabledAt).toLocaleDateString() : '–', 1: st.recoveryLeft }) }), _jsxs("div", { className: "flex flex-wrap gap-3 text-sm", children: [_jsx("button", { type: "button", onClick: () => setMode('device'), className: "font-semibold text-accent", children: t("Add another device") }), _jsx("button", { type: "button", onClick: () => setMode('newcodes'), className: "font-semibold text-accent", children: t("New recovery codes") }), !(user.isAdmin && st.adminRequired) && (_jsx("button", { type: "button", onClick: () => setMode('off'), className: "text-muted hover:text-loss", children: t("Switch off") }))] })] }))] }));
}
