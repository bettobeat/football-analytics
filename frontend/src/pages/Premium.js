import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import { refreshUnlocks, useUnlocks, resetDay } from '../lib/unlocks';
import { t } from '../lib/i18n';
/**
 * Plans: Free · Premium $15 (60 match unlocks a month) · Pro $30 (unlimited + draw alerts) · Pro yearly.
 * Pro sits in the middle and is marked "Most popular". While the backend runs with BILLING_TEST_MODE=1 the buttons
 * switch the plan straight away (test checkout); otherwise they say payments open soon.
 */
const FREE = [t("2 full picks a week with a free account"), t("Live scores, lineups and events"), t("League tables, team and player pages"), t("Latest results and our public record")];
const PREMIUM = [
    t("60 match unlocks a month"),
    t("Win / draw / loss %, and why this pick"),
    t("Goals: over/under, both teams score, likely scores"),
    t("Every finished match in full"),
    t("Full team and player stats")
];
const PRO = [
    t("Unlimited predictions, no counting"),
    t("Everything in Premium"),
    t("Draw picks: the 2 likeliest draws every week"),
    t("Basketball, tennis and UFC as they launch"),
    t("Early access to new models and features")
];
function Check() {
    return (_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", className: "text-accent flex-shrink-0 mt-0.5", "aria-hidden": true, children: _jsx("path", { d: "M5 12.5l4.5 4.5L19 7.5" }) }));
}
export default function Premium() {
    const { user, access, refresh } = useAuth();
    const [testMode, setTestMode] = useState(false);
    const [busy, setBusy] = useState(null);
    const [msg, setMsg] = useState(null);
    const u = useUnlocks(access === 'premium');
    useEffect(() => {
        axios
            .get(`${API_URL}/billing/plans`)
            .then(r => setTestMode(!!r.data.data?.testMode))
            .catch(() => undefined);
    }, []);
    const choose = async (plan, label) => {
        setBusy(plan);
        setMsg(null);
        try {
            await axios.post(`${API_URL}/billing/test-checkout`, { plan });
            await refresh();
            await refreshUnlocks();
            setMsg({ ok: true, text: plan === 'free' ? t("You are back on Free (test).") : t("You are on {0} now (test checkout, no payment taken).", { 0: label }) });
        }
        catch (e) {
            setMsg({ ok: false, text: errorText(e) });
        }
        finally {
            setBusy(null);
        }
    };
    const button = (plan, label, primary) => {
        const target = plan === 'pro-year' ? 'pro' : plan;
        if (access === 'admin')
            return _jsx("div", { className: "rounded-xl bg-surface2/70 text-center py-2.5 text-sm text-muted", children: t("Admin: full access") });
        if (access === target)
            return _jsx("div", { className: "rounded-xl bg-accent/15 text-accent text-center py-2.5 text-sm font-semibold", children: t("Your plan") });
        if (!user)
            return (_jsx(Link, { to: "/signup?next=/premium", className: `block text-center rounded-xl py-2.5 text-sm font-semibold ${primary ? 'bg-accent text-bg' : 'border border-line text-ink hover:border-faint'}`, children: t("Create an account") }));
        if (!testMode)
            return _jsx("div", { className: "rounded-xl border border-line text-center py-2.5 text-sm text-muted", children: t("Payments open soon") });
        const upgrade = access === 'premium' && target === 'pro';
        return (_jsx("button", { onClick: () => choose(plan, label), disabled: !!busy, className: `w-full rounded-xl py-2.5 text-sm font-extrabold disabled:opacity-60 ${primary ? 'bg-accent text-bg' : 'border border-line text-ink hover:border-faint'}`, children: busy === plan ? t("Switching…") : upgrade ? t("Upgrade to {0}", { 0: label }) : t("Choose {0}", { 0: label }) }));
    };
    return (_jsxs("div", { className: "max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14", children: [_jsxs("div", { className: "text-center max-w-2xl mx-auto", children: [_jsx("h1", { className: "font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink", children: t("See the numbers behind every pick") }), _jsx("p", { className: "text-muted mt-3", children: t("Every prediction is saved before kick-off and scored in public. Pick the plan that fits how much you use it.") }), _jsx("p", { className: "mt-4 inline-flex items-center gap-2 rounded-full border border-win/40 bg-win/10 px-3 py-1 text-xs font-semibold text-win", children: t("3-day money-back guarantee · cancel any time") }), testMode && (_jsx("p", { className: "mt-4 inline-block rounded-full border border-draw/40 bg-draw/10 px-3 py-1 text-xs font-semibold text-draw", children: t("Test mode: choosing a plan switches it straight away, no payment is taken") }))] }), access === 'premium' && u && u.left !== null && (_jsxs("div", { className: "mt-8 card p-4 flex flex-wrap items-center justify-between gap-3", children: [_jsx("div", { className: "text-sm text-ink", children: t("{0} of {1} unlocks left this month · renews {2}", { 0: u.left, 1: u.allowance, 2: resetDay(u.resetsAt) }) }), _jsx("div", { className: "h-2 w-full sm:w-64 rounded-full bg-surface2 overflow-hidden", children: _jsx("div", { className: "h-full bg-accent", style: { width: `${(u.left / Math.max(1, u.allowance)) * 100}%` } }) })] })), _jsxs("div", { className: "mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch", children: [_jsxs("div", { className: "card p-6 flex flex-col", children: [_jsx("div", { className: "label", children: t("Premium") }), _jsxs("div", { className: "mt-1 flex items-baseline gap-1", children: [_jsx("span", { className: "font-display text-4xl font-extrabold text-ink", children: "$15" }), _jsx("span", { className: "text-sm text-muted", children: "/ month" })] }), _jsx("div", { className: "text-xs text-faint mt-1", children: t("60 matches · about $0.25 per match") }), _jsx("ul", { className: "mt-5 space-y-2.5 text-sm text-ink/90 flex-1", children: PREMIUM.map(f => (_jsxs("li", { className: "flex gap-2", children: [_jsx(Check, {}), " ", f] }, f))) }), _jsx("div", { className: "mt-6", children: button('premium', 'Premium', false) })] }), _jsxs("div", { className: "card p-6 flex flex-col relative overflow-hidden border-accent/60 xl:-my-3 xl:py-9 shadow-lift order-first xl:order-none", children: [_jsx("div", { className: "pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-accent/20 blur-3xl" }), _jsx("span", { className: "absolute top-4 right-4 text-[10px] font-extrabold uppercase tracking-wider text-bg bg-accent px-2.5 py-1 rounded-full", children: t("Most popular") }), _jsxs("div", { className: "relative flex flex-col flex-1", children: [_jsx("div", { className: "label text-accent", children: t("Pro") }), _jsxs("div", { className: "mt-1 flex items-baseline gap-1", children: [_jsx("span", { className: "font-display text-4xl font-extrabold text-ink", children: "$30" }), _jsx("span", { className: "text-sm text-muted", children: "/ month" })] }), _jsx("div", { className: "text-xs text-accent font-semibold mt-1", children: t("Unlimited matches") }), _jsx("ul", { className: "mt-5 space-y-2.5 text-sm text-ink/90 flex-1", children: PRO.map(f => (_jsxs("li", { className: "flex gap-2", children: [_jsx(Check, {}), " ", f] }, f))) }), _jsx("div", { className: "mt-6", children: button('pro', 'Pro', true) })] })] }), _jsxs("div", { className: "card p-6 flex flex-col", children: [_jsx("div", { className: "label", children: t("Pro 6 months") }), _jsxs("div", { className: "mt-1 flex items-baseline gap-1", children: [_jsx("span", { className: "font-display text-4xl font-extrabold text-ink", children: "$144" }), _jsx("span", { className: "text-sm text-muted", children: "/ 6 months" })] }), _jsx("div", { className: "text-xs text-win font-semibold mt-1", children: t("$24 a month · save 20%") }), _jsxs("ul", { className: "mt-5 space-y-2.5 text-sm text-ink/90 flex-1", children: [_jsxs("li", { className: "flex gap-2", children: [_jsx(Check, {}), " ", t("Everything in Pro")] }), _jsxs("li", { className: "flex gap-2", children: [_jsx(Check, {}), " ", t("One payment every 6 months")] })] }), _jsx("div", { className: "mt-6", children: button('pro-6m', t("Pro 6 months"), false) })] }), _jsxs("div", { className: "card p-6 flex flex-col relative border-home/60", children: [_jsx("span", { className: "absolute top-4 right-4 text-[10px] font-extrabold uppercase tracking-wider text-white bg-home px-2.5 py-1 rounded-full", children: t("Best offer") }), _jsx("div", { className: "label text-home", children: t("Pro yearly") }), _jsxs("div", { className: "mt-1 flex items-baseline gap-1", children: [_jsx("span", { className: "font-display text-4xl font-extrabold text-ink", children: "$249" }), _jsx("span", { className: "text-sm text-muted", children: "/ year" })] }), _jsx("div", { className: "text-xs text-win font-semibold mt-1", children: t("About $21 a month · save 30%") }), _jsxs("ul", { className: "mt-5 space-y-2.5 text-sm text-ink/90 flex-1", children: [_jsxs("li", { className: "flex gap-2", children: [_jsx(Check, {}), " ", t("Everything in Pro")] }), _jsxs("li", { className: "flex gap-2", children: [_jsx(Check, {}), " ", t("One payment a year")] })] }), _jsx("div", { className: "mt-6", children: button('pro-year', t("Pro yearly"), false) })] })] }), msg && _jsx("p", { className: `mt-6 text-center text-sm ${msg.ok ? 'text-win' : 'text-loss'}`, children: msg.text }), _jsxs("div", { className: "mt-10 card p-6", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "label", children: t("Free") }), _jsx("div", { className: "font-display text-xl font-bold text-ink mt-0.5", children: "$0" })] }), testMode && user && (access === 'premium' || access === 'pro') && (_jsx("button", { onClick: () => choose('free', 'Free'), disabled: !!busy, className: "text-xs text-muted hover:text-ink underline", children: t("Back to Free (test)") }))] }), _jsx("ul", { className: "mt-3 grid sm:grid-cols-2 gap-2 text-sm text-ink/90", children: FREE.map(f => (_jsxs("li", { className: "flex gap-2", children: [_jsx(Check, {}), " ", f] }, f))) }), !user && (_jsx(Link, { to: "/signup", className: "mt-5 inline-block rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-faint", children: t("Create free account") }))] }), _jsx("p", { className: "mt-8 text-center text-xs text-faint max-w-xl mx-auto", children: t("3-day money-back guarantee on every plan: not for you? Ask within 3 days of paying and you get the full amount back. Unlocked matches stay open. Finished matches are always open on paid plans. Unlocks renew on the 1st of every month. Predictions are probabilities, not promises. SportLikely is an analytics service and does not take bets.") })] }));
}
