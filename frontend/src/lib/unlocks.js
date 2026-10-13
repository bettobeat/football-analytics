import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from './socket';
import { LOCALE, t } from './i18n';
const EVT = 'b2b-unlocks';
let current = null;
let pending = null;
export function refreshUnlocks() {
    if (pending)
        return pending;
    pending = axios
        .get(`${API_URL}/unlocks`)
        .then(r => {
        current = r.data.data;
        window.dispatchEvent(new Event(EVT));
    })
        .catch(() => undefined)
        .finally(() => {
        pending = null;
    });
    return pending;
}
export function useUnlocks(enabled = true) {
    const [, setN] = useState(0);
    useEffect(() => {
        const f = () => setN(n => n + 1);
        window.addEventListener(EVT, f);
        if (enabled && !current)
            refreshUnlocks();
        return () => window.removeEventListener(EVT, f);
    }, [enabled]);
    return enabled ? current : null;
}
/** Spend one unlock on a match. Resolves with the new status; rejects with { upgrade: true } when none are left. */
export async function unlockMatch(matchId, status) {
    try {
        const r = await axios.post(`${API_URL}/unlocks/${matchId}`, { status });
        current = r.data.data;
        window.dispatchEvent(new Event(EVT));
        return r.data.data;
    }
    catch (e) {
        if (e?.response?.data?.data) {
            current = e.response.data.data;
            window.dispatchEvent(new Event(EVT));
        }
        throw { upgrade: !!e?.response?.data?.upgrade, message: e?.response?.data?.error || t("Could not unlock this match. Try again.") };
    }
}
export const resetDay = (iso) => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
