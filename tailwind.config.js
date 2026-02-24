/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
            colors: {
                surface: "#0b0b14",
                panel: "#111119",
                border: "#1c1c2e",
                accent: "rgba(var(--accent-rgb), <alpha-value>)",
                "accent-bright": "var(--accent-bright)",
                "accent-dim": "var(--accent-dim)",
                muted: "#52526e",
                "muted-light": "#8888a8",
                "ft-folder": "#f59e0b",
                "ft-code": "#34d399",
                "ft-image": "#f472b6",
                "ft-video": "#a78bfa",
                "ft-audio": "#60a5fa",
                "ft-doc": "#6ee7b7",
                "ft-archive": "#fb923c",
                "ft-exe": "#f87171",
                "ft-generic": "#94a3b8",
            },
            boxShadow: {
                "glow-accent": "0 0 24px 0 rgba(var(--accent-rgb), 0.25)",
                "glow-sm": "0 0 8px 0 rgba(var(--accent-rgb), 0.15)",
            },
            animation: {
                "slide-up": "slideUp 0.18s ease-out both",
                "fade-in": "fadeIn 0.12s ease-out both",
                "pulse-slow": "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
            },
            keyframes: {
                slideUp: {
                    from: { opacity: "0", transform: "translateY(6px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                fadeIn: {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
            },
        },
    },
    plugins: [],
};
