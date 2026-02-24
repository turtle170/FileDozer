import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
    path: string;
    onClose: () => void;
}

type Encoding = "UTF-8" | "UTT-T" | "UTT-C";

const ENC_OPTIONS: { id: Encoding; label: string; desc: string }[] = [
    { id: "UTF-8", label: "UTF-8", desc: "Standard · Universal" },
    { id: "UTT-T", label: "UTF-Tiny T", desc: "Text-optimised · Huffman" },
    { id: "UTT-C", label: "UTF-Tiny C", desc: "Code-optimised · Huffman" },
];

const TEXT_EXTS = new Set([
    "txt", "md", "rs", "ts", "tsx", "js", "jsx", "py", "go", "cpp", "c", "h", "java", "cs",
    "html", "css", "json", "yaml", "yml", "toml", "xml", "sh", "bat", "ps1", "lua", "rb",
    "php", "swift", "kt", "sql", "env", "gitignore", "log", "ini", "cfg", "conf",
]);

function isTextPath(path: string) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return TEXT_EXTS.has(ext);
}

function langFromPath(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const MAP: Record<string, string> = {
        rs: "rust", ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
        py: "python", go: "go", cpp: "cpp", c: "c", h: "c", java: "java",
        cs: "csharp", html: "html", css: "css", json: "json", md: "markdown",
        yaml: "yaml", yml: "yaml", toml: "toml", sh: "bash", sql: "sql",
    };
    return MAP[ext] ?? "plaintext";
}

function lineCount(text: string) { return text.split("\n").length; }

export function canOpenInEditor(path: string) { return isTextPath(path); }

export default function Editor({ path, onClose }: Props) {
    const [content, setContent] = useState("");
    const [encoding, setEncoding] = useState<Encoding>("UTF-8");
    const [saved, setSaved] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [encInfo, setEncInfo] = useState<string>("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const filename = path.split("\\").pop() ?? path;

    useEffect(() => {
        setLoading(true);
        invoke<string>("read_file", { path })
            .then(text => { setContent(text); setLoading(false); setSaved(true); })
            .catch(e => { setError(String(e)); setLoading(false); });
    }, [path]);

    useEffect(() => {
        const bytes = new TextEncoder().encode(content).length;
        const lines = lineCount(content);
        const chars = content.length;
        setEncInfo(`${chars} chars · ${lines} lines · ${(bytes / 1024).toFixed(1)} KB`);
    }, [content]);

    const save = useCallback(async () => {
        const enc = encoding === "UTT-T" ? "UTT-T" : encoding === "UTT-C" ? "UTT-C" : "UTF-8";
        try {
            await invoke("write_file", { path, content, encoding: enc });
            setSaved(true);
        } catch (e) { setError(String(e)); }
    }, [path, content, encoding]);

    const convertEncoding = useCallback(async (target: Encoding) => {
        setEncoding(target);
        setSaved(false);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { onClose(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [save, onClose]);

    return (
        <div className="absolute inset-0 z-40 flex flex-col glass border border-border/60 rounded-2xl overflow-hidden animate-slide-up">
            {/* titlebar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 select-none" data-tauri-drag-region>
                <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f57] hover:opacity-80 transition-opacity shrink-0" title="Close (Esc)" />
                <span className="text-xs text-muted font-mono truncate flex-1">{path}</span>
                <span className="text-xs font-bold" style={{ color: saved ? "#34d399" : "#f59e0b" }}>
                    {saved ? "Saved" : "Unsaved"}
                </span>
            </div>

            {/* toolbar */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
                <span className="text-[11px] font-bold text-accent font-mono">{filename}</span>
                <span className="text-[11px] text-muted ml-1">{langFromPath(path)}</span>
                <div className="ml-auto flex items-center gap-1">
                    {ENC_OPTIONS.map(opt => (
                        <button
                            key={opt.id}
                            title={opt.desc}
                            onClick={() => convertEncoding(opt.id)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors duration-100 ${encoding === opt.id
                                    ? "bg-accent text-white"
                                    : "bg-border text-muted hover:text-white hover:bg-accent/20"
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={save}
                    className="px-3 py-0.5 rounded bg-accent hover:bg-accent-bright text-white text-[11px] font-semibold transition-colors"
                >
                    Save
                </button>
                <button
                    onClick={() => open(path.slice(0, path.lastIndexOf("\\"))).catch(console.error)}
                    className="text-muted hover:text-white transition-colors p-1 rounded hover:bg-border"
                    title="Show in Explorer"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </button>
            </div>

            {/* main area */}
            <div className="flex-1 overflow-hidden relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-muted animate-pulse text-sm">Loading…</span>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                        <div>
                            <p className="text-ft-exe text-sm font-semibold mb-2">Failed to open file</p>
                            <p className="text-muted text-xs font-mono">{error}</p>
                        </div>
                    </div>
                )}
                {!loading && !error && (
                    <div className="flex h-full">
                        {/* line numbers */}
                        <div className="shrink-0 w-10 overflow-hidden select-none pt-3 pb-3 pr-2 text-right"
                            style={{ background: "rgba(0,0,0,0.15)" }}>
                            {content.split("\n").map((_, i) => (
                                <div key={i} className="text-muted text-[11px] font-mono leading-[1.6rem]">{i + 1}</div>
                            ))}
                        </div>
                        {/* editor */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={e => { setContent(e.target.value); setSaved(false); }}
                            spellCheck={false}
                            className="flex-1 resize-none p-3 bg-transparent text-white text-[13px] font-mono leading-[1.6rem] outline-none"
                            style={{ letterSpacing: "0.01em" }}
                        />
                    </div>
                )}
            </div>

            {/* status bar */}
            <div className="flex items-center gap-3 px-4 py-1 border-t border-border text-[11px] text-muted shrink-0 select-none">
                <span>{encInfo}</span>
                <span className="ml-auto flex items-center gap-1.5">
                    {encoding !== "UTF-8" && (
                        <span className="text-accent font-semibold">{encoding}</span>
                    )}
                    <span className="text-muted/60">Ctrl+S to save · Esc to close</span>
                </span>
            </div>
        </div>
    );
}
