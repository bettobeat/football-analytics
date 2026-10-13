import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SPORTS, sportOfPath } from '../lib/sports';
import { t } from '../lib/i18n';
import { useBbConfig } from '../lib/bb';
/** Sport picker next to the logo: Football now, the other sports as "soon". */
export default function SportSwitch() {
    const loc = useLocation();
    const current = sportOfPath(loc.pathname);
    const bb = useBbConfig();
    // basketball is open for admins before launch, for everyone after
    const isLive = (id, live) => live || (id === 'basketball' && !!bb?.open);
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => setOpen(false), [loc.pathname]);
    useEffect(() => {
        if (!open)
            return;
        const close = (e) => { if (box.current && !box.current.contains(e.target))
            setOpen(false); };
        const esc = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
    }, [open]);
    return (_jsxs("div", { ref: box, className: "relative shrink-0", children: [_jsxs("button", { type: "button", onClick: () => setOpen(o => !o), "aria-haspopup": "menu", "aria-expanded": open, "aria-label": t('Choose a sport'), title: current.name, className: "h-9 pl-2 pr-1.5 inline-flex items-center gap-1.5 rounded-xl border border-line/80 bg-surface hover:border-faint text-ink", children: [_jsx("span", { className: "text-sm font-bold leading-none", children: current.name }), _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "text-muted", children: _jsx("path", { d: "m6 9 6 6 6-6" }) })] }), open && (_jsx("div", { role: "menu", className: "absolute left-0 top-11 z-50 w-60 rounded-2xl border border-line/80 bg-surface shadow-lift p-1.5", children: SPORTS.map(s => {
                    const active = s.id === current.id;
                    return (_jsxs(Link, { to: s.path, role: "menuitem", className: `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${active ? 'bg-accent/15 text-ink font-bold' : 'text-ink hover:bg-surface2'}`, children: [_jsx("span", { className: "text-lg leading-none", "aria-hidden": true, children: s.icon }), _jsx("span", { className: "flex-1", children: s.name }), !isLive(s.id, s.live) && _jsx("span", { className: "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface2 text-muted", children: t('Soon') }), active && isLive(s.id, s.live) && _jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent", "aria-hidden": true })] }, s.id));
                }) }))] }));
}
