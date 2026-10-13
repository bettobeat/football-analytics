import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
/** Shows children to premium users and admins; everyone else gets a short explanation and a way in. */
export default function PremiumGate({ title, children, pro = false }) {
    const { full, paid, user, loading } = useAuth();
    if (loading)
        return _jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 py-16 text-sm text-faint", children: t("Loading…") });
    if (pro ? full : paid)
        return _jsx(_Fragment, { children: children });
    return (_jsx("div", { className: "max-w-xl mx-auto px-4 sm:px-6 py-16", children: _jsxs("div", { className: "card p-8 text-center", children: [_jsx("div", { className: "mx-auto w-12 h-12 rounded-2xl bg-accent/15 text-accent grid place-items-center mb-4", children: _jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("rect", { x: "4", y: "11", width: "16", height: "10", rx: "2" }), _jsx("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" })] }) }), _jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: t("{0} is a {1} page", { 0: title, 1: pro ? t("Pro") : t("Premium") }) }), _jsx("p", { className: "text-sm text-muted mt-2", children: pro ? t("Draw picks: the 2 games of the week most likely to end in a draw, by our model. They are part of Pro, together with unlimited predictions.") : t("Premium shows how every model has performed on real matches: hit rate, how sure we were, strong picks and every result.") }), _jsxs("div", { className: "mt-6 flex justify-center gap-2", children: [_jsx(Link, { to: "/premium", className: "px-4 py-2 rounded-xl bg-accent text-bg text-sm font-semibold", children: pro ? t("See Pro") : t("See Premium") }), !user && (_jsx(Link, { to: `/login?next=${encodeURIComponent(window.location.pathname.replace(/^\/[a-z]{2}(?=\/|$)/, ''))}`, className: "px-4 py-2 rounded-xl border border-line text-sm font-medium text-ink hover:border-faint", children: t("Sign in") }))] })] }) }));
}
