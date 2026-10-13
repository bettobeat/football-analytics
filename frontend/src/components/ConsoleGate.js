import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
const input = 'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const btn = 'w-full rounded-xl bg-accent text-bg font-semibold px-4 py-2.5 text-sm disabled:opacity-60';
const Ctx = createContext({ username: null, lock: () => undefined, changePassword: () => undefined });
/** Inside the gate: the console username, "Lock console" and "Change console password". */
export const useConsole = () => useContext(Ctx);
function Box({ title, sub, children }) {
    return (_jsx("div", { className: "max-w-sm mx-auto px-4 py-14", children: _jsxs("div", { className: "card p-6 space-y-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "w-10 h-10 rounded-xl bg-accent/15 text-accent grid place-items-center shrink-0", "aria-hidden": true, children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }), _jsx("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" })] }) }), _jsx("h1", { className: "font-display text-xl font-extrabold text-ink", children: title })] }), _jsx("div", { className: "text-sm text-muted", children: sub }), children] }) }));
}
const Err = ({ e }) => (e ? _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: e }) : null);
export default function ConsoleGate({ children }) {
    const { user, loading } = useAuth();
    const [st, setSt] = useState(null);
    const [fail, setFail] = useState(null);
    const [mode, setMode] = useState('normal');
    const [username, setUsername] = useState('');
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [cur, setCur] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const load = useCallback(() => axios.get(`${API_URL}/crm/console/status`).then(r => { setSt(r.data.data); setFail(null); }).catch(e => setFail(errorText(e))), []);
    useEffect(() => { if (user)
        load(); }, [user?.id, load]);
    // the server locked the console (sign-in elsewhere, password set by a manager): show the gate again
    useEffect(() => {
        const id = axios.interceptors.response.use(undefined, err => {
            if (err?.response?.status === 423 && err?.response?.data?.console)
                load();
            return Promise.reject(err);
        });
        return () => axios.interceptors.response.eject(id);
    }, [load]);
    const run = async (fn) => {
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            await fn();
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    };
    const clear = () => { setPw(''); setPw2(''); setCur(''); setCode(''); };
    const lock = () => { axios.post(`${API_URL}/crm/console/lock`).finally(() => { clear(); setMode('normal'); load(); }); };
    const changePassword = () => { clear(); setError(null); setInfo(null); setMode('change'); };
    if (loading || (user && !st && !fail))
        return null;
    if (!user || fail)
        return _jsx(_Fragment, { children: children }); // the page itself explains (sign in / staff only / two-step needed)
    const s = st;
    const newPwFields = (label) => (_jsxs(_Fragment, { children: [_jsx("input", { className: input, type: "password", value: pw, onChange: e => setPw(e.target.value), placeholder: label, autoComplete: "new-password", minLength: 10, required: true }), _jsx("input", { className: input, type: "password", value: pw2, onChange: e => setPw2(e.target.value), placeholder: "Repeat it", autoComplete: "new-password", required: true }), _jsx("p", { className: "text-[11px] text-faint", children: "At least 10 characters. It must be different from your account password." })] }));
    const same = () => { if (pw !== pw2)
        throw { response: { data: { error: 'The two passwords are not the same.' } } }; };
    // change the console password (required after a manager set it, or chosen from the CRM header)
    if (s.unlocked && (s.mustChange || mode === 'change')) {
        const submit = (e) => {
            e.preventDefault();
            run(async () => {
                same();
                await axios.post(`${API_URL}/crm/console/change`, { current: cur, next: pw });
                clear();
                setMode('normal');
                await load();
            });
        };
        return (_jsx(Box, { title: "New console password", sub: s.mustChange ? 'Your console password was set by a manager. Choose your own before you continue.' : _jsxs(_Fragment, { children: ["Signed in to the console as ", _jsx("b", { className: "text-ink", children: s.username }), "."] }), children: _jsxs("form", { onSubmit: submit, className: "space-y-3", children: [_jsx("input", { className: input, type: "password", value: cur, onChange: e => setCur(e.target.value), placeholder: "Current console password", autoComplete: "current-password", required: true }), newPwFields('New console password'), _jsx(Err, { e: error }), _jsx("button", { type: "submit", disabled: busy, className: btn, children: busy ? 'Saving…' : 'Save new password' }), !s.mustChange && _jsx("button", { type: "button", onClick: () => setMode('normal'), className: "w-full text-sm text-muted", children: "Cancel" })] }) }));
    }
    if (s.unlocked)
        return _jsx(Ctx.Provider, { value: { username: s.username, lock, changePassword }, children: children });
    // no console login yet
    if (!s.hasLogin) {
        if (!s.isAdmin)
            return (_jsx(Box, { title: "Staff console", sub: "You don\u2019t have a console login yet. Ask your manager to set one for you in CRM \u2192 Team & roles.", children: _jsx(_Fragment, {}) }));
        const submit = (e) => {
            e.preventDefault();
            run(async () => {
                same();
                await axios.post(`${API_URL}/crm/console/setup`, { username, password: pw });
                clear();
                await load();
            });
        };
        return (_jsx(Box, { title: "Create your console login", sub: "The CRM and Users ask for this once after every sign-in. Choose a username and a password that is different from your account password.", children: _jsxs("form", { onSubmit: submit, className: "space-y-3", children: [_jsx("input", { className: input, value: username, onChange: e => setUsername(e.target.value), placeholder: "Console username", autoCapitalize: "none", spellCheck: false, autoComplete: "username", required: true }), newPwFields('Console password'), _jsx(Err, { e: error }), _jsx("button", { type: "submit", disabled: busy, className: btn, children: busy ? 'Saving…' : 'Create and continue' })] }) }));
    }
    // admin forgot their console login: account password + two-step code
    if (mode === 'reset') {
        const submit = (e) => {
            e.preventDefault();
            run(async () => {
                await axios.post(`${API_URL}/crm/console/reset`, { password: pw, code });
                clear();
                setMode('normal');
                await load();
            });
        };
        return (_jsx(Box, { title: "Reset console login", sub: "Confirm with your account password and a code from your authenticator app. Then you choose a new console login.", children: _jsxs("form", { onSubmit: submit, className: "space-y-3", children: [_jsx("input", { className: input, type: "password", value: pw, onChange: e => setPw(e.target.value), placeholder: "Account password", autoComplete: "current-password", required: true }), _jsx("input", { className: `${input} text-center num tracking-[0.3em]`, value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), inputMode: "numeric", autoComplete: "one-time-code", placeholder: "6-digit code", required: true }), _jsx(Err, { e: error }), _jsx("button", { type: "submit", disabled: busy || code.length !== 6, className: btn, children: busy ? 'Checking…' : 'Reset' }), _jsx("button", { type: "button", onClick: () => { clear(); setMode('normal'); }, className: "w-full text-sm text-muted", children: "Back" })] }) }));
    }
    const submit = (e) => {
        e.preventDefault();
        run(async () => {
            const r = await axios.post(`${API_URL}/crm/console/login`, { username, password: pw });
            if (r.data.data.mustChange)
                setCur(pw);
            setPw('');
            await load();
        });
    };
    return (_jsx(Box, { title: "Staff console", sub: "Sign in with your console username and password (not your account password). Your manager gives you these.", children: _jsxs("form", { onSubmit: submit, className: "space-y-3", children: [_jsx("input", { className: input, value: username, onChange: e => setUsername(e.target.value), placeholder: "Console username", autoCapitalize: "none", spellCheck: false, autoComplete: "username", required: true, autoFocus: true }), _jsx("input", { className: input, type: "password", value: pw, onChange: e => setPw(e.target.value), placeholder: "Console password", autoComplete: "current-password", required: true }), _jsx(Err, { e: error }), info && _jsx("div", { className: "text-sm text-win", children: info }), _jsx("button", { type: "submit", disabled: busy, className: btn, children: busy ? 'Checking…' : 'Open' }), _jsx("p", { className: "text-[11px] text-faint text-center", children: s.isAdmin
                        ? _jsx("button", { type: "button", onClick: () => { clear(); setError(null); setMode('reset'); }, className: "underline", children: "Forgot your console login?" })
                        : 'Forgot it? Ask your manager to reset it.' })] }) }));
}
