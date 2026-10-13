import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_URL, socket } from './socket';
import { t } from './i18n';
// Same-origin cookies are sent by default; this also covers a separate API host
axios.defaults.withCredentials = true;
const AuthContext = createContext(null);
/** Readable message from an axios error. */
export function errorText(e, fallback = t("Something went wrong. Please try again.")) {
    return e?.response?.data?.error || e?.response?.data?.message || fallback;
}
// Socket rooms are chosen at connect time from the session cookie — reconnect after sign-in / sign-out
function reconnectSocket() {
    socket.disconnect();
    socket.connect();
}
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [access, setAccess] = useState('anon');
    const [staff, setStaff] = useState(null);
    const [perms, setPerms] = useState([]);
    const [tester, setTester] = useState(null);
    const [loading, setLoading] = useState(true);
    const [verificationRequired, setVerificationRequired] = useState(false);
    const apply = (d) => {
        setUser(d.user);
        setAccess(d.access);
        setStaff(d.staff ?? null);
        setPerms(d.perms ?? []);
        setTester(d.tester ?? null);
        if (typeof d.verificationRequired === 'boolean')
            setVerificationRequired(d.verificationRequired);
    };
    const refresh = useCallback(async () => {
        try {
            const r = await axios.get(`${API_URL}/auth/me`);
            apply(r.data);
        }
        catch {
            apply({ user: null, access: 'anon' });
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        refresh();
        // pick up changes made elsewhere (Premium granted/expired, signed out in another tab)
        const onFocus = () => {
            if (document.visibilityState === 'visible')
                refresh();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [refresh]);
    // Live-score rooms (full / teaser) are chosen at connect time: reconnect when the access level changes
    const firstAccess = useRef(true);
    useEffect(() => {
        if (firstAccess.current) {
            firstAccess.current = false;
            return;
        }
        reconnectSocket();
    }, [access]);
    const login = async (email, password) => {
        const r = await axios.post(`${API_URL}/auth/login`, { email, password });
        if (r.data?.twoFactor)
            return { ticket: r.data.ticket };
        apply(r.data);
        return {};
    };
    const loginCode = async (ticket, code) => {
        const r = await axios.post(`${API_URL}/auth/2fa/login`, { ticket, code });
        apply(r.data);
    };
    const signup = async (email, password, name, optIn, adult) => {
        const r = await axios.post(`${API_URL}/auth/signup`, { email, password, name, optIn: !!optIn, adult: !!adult });
        apply(r.data);
    };
    const verify = async (code) => {
        const r = await axios.post(`${API_URL}/auth/verify`, { code });
        apply(r.data);
    };
    const resendCode = async () => {
        await axios.post(`${API_URL}/auth/verify/resend`);
    };
    const resetPassword = async (email, code, password) => {
        const r = await axios.post(`${API_URL}/auth/reset`, { email, code, password });
        if (r.data?.twoFactor)
            return { ticket: r.data.ticket };
        apply(r.data);
        return {};
    };
    const setOptIn = async (on) => {
        const r = await axios.post(`${API_URL}/auth/preferences`, { optIn: on });
        apply(r.data);
    };
    const logout = async () => {
        try {
            await axios.post(`${API_URL}/auth/logout`);
        }
        catch {
            /* signed out locally anyway; the next /auth/me call shows the real state */
        }
        apply({ user: null, access: 'anon' });
    };
    const full = access === 'pro' || access === 'admin';
    const paid = full || access === 'premium';
    const needsVerification = !!user && verificationRequired && !user.emailVerified;
    return (_jsx(AuthContext.Provider, { value: { user, access, staff, tester, can: (p) => perms.includes(p), loading, full, paid, needsVerification, login, loginCode, signup, verify, resendCode, resetPassword, setOptIn, logout, refresh }, children: children }));
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth outside AuthProvider');
    return ctx;
}
