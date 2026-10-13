import { useEffect, useState } from 'react';
const KEY = 'b2b-theme';
function read() {
    try {
        const t = localStorage.getItem(KEY);
        if (t === 'light' || t === 'dark')
            return t;
    }
    catch {
        /* ignore */
    }
    return 'dark';
}
export function useTheme() {
    const [theme, setTheme] = useState(read);
    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        try {
            localStorage.setItem(KEY, theme);
        }
        catch {
            /* ignore */
        }
    }, [theme]);
    return { theme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) };
}
