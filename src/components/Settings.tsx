import { useState } from "react";

export const THEMES = [
    { id: "purple", name: "Nebula Purple", accent: "#7c3aed", bright: "#9333ea", dim: "#4c1d95", rgb: "124, 58, 237" },
    { id: "blue", name: "Quantum Blue", accent: "#3b82f6", bright: "#60a5fa", dim: "#2563eb", rgb: "59, 130, 246" },
    { id: "green", name: "Matrix Green", accent: "#10b981", bright: "#34d399", dim: "#059669", rgb: "16, 185, 129" },
    { id: "rose", name: "Ruby Rose", accent: "#e11d48", bright: "#f43f5e", dim: "#be123c", rgb: "225, 29, 72" },
    { id: "amber", name: "Solar Amber", accent: "#f59e0b", bright: "#fbbf24", dim: "#d97706", rgb: "245, 158, 11" },
];

export function applyTheme(themeId: string) {
    const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-bright", theme.bright);
    root.style.setProperty("--accent-dim", theme.dim);
    root.style.setProperty("--accent-rgb", theme.rgb);
    localStorage.setItem("filedozer-theme", theme.id);
}

export function loadTheme() {
    const saved = localStorage.getItem("filedozer-theme");
    if (saved) applyTheme(saved);
}

export default function Settings() {
    const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem("filedozer-theme") || "purple");

    const handleThemeChange = (id: string) => {
        setActiveTheme(id);
        applyTheme(id);
    };

    return (
        <div className="flex-1 flex flex-col p-8 overflow-y-auto animate-fade-in">
            <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>

            <section className="bg-panel rounded-xl border border-border p-6 shadow-glow-sm">
                <h3 className="text-lg font-semibold text-white mb-4">Appearance Theme</h3>
                <p className="text-sm text-muted mb-6">Customize the interface color accents.</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {THEMES.map(theme => (
                        <button
                            key={theme.id}
                            onClick={() => handleThemeChange(theme.id)}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ${activeTheme === theme.id
                                ? "border-accent bg-accent/10"
                                : "border-border hover:border-muted bg-surface"
                                }`}
                        >
                            <div
                                className="w-5 h-5 rounded-full shadow-md"
                                style={{ background: theme.accent, boxShadow: `0 0 10px rgba(${theme.rgb}, 0.5)` }}
                            />
                            <span className="text-sm font-medium text-white">{theme.name}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
