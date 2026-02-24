import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useState, useEffect, useCallback } from "react";

interface DirEntry { name: string; path: string; is_dir: boolean; size: number; }


function fmtSize(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
}


function FileEntryIcon({ is_dir, name }: { is_dir: boolean; name: string }) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (is_dir) return (
        <svg className="w-4 h-4 text-ft-folder shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
    );
    const code = ["rs", "ts", "tsx", "js", "jsx", "py", "go", "cpp", "c", "h", "java", "cs", "rb", "php"];
    const img = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"];
    const vid = ["mp4", "mkv", "avi", "mov"];
    const arc = ["zip", "rar", "7z", "tar", "gz", "dz"];
    const col = code.includes(ext) ? "text-ft-code"
        : img.includes(ext) ? "text-ft-image"
            : vid.includes(ext) ? "text-ft-video"
                : arc.includes(ext) ? "text-ft-archive"
                    : "text-ft-generic";
    return (
        <svg className={`w-4 h-4 ${col} shrink-0`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
    );
}

interface Props {
    initialPath?: string;
    onAddPanel: (fromPath: string) => void;
    onClose?: () => void;
    canAdd: boolean;
    canClose: boolean;
    onFileOpen?: (path: string, is_dir: boolean) => void;
}

export default function FileBrowser({ initialPath, onAddPanel, onClose, canAdd, canClose, onFileOpen }: Props) {
    const [path, setPath] = useState(initialPath ?? "C:\\");
    const [entries, setEntries] = useState<DirEntry[]>([]);
    const [drives, setDrives] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");

    const loadDir = useCallback(async (p: string) => {
        setLoading(true);
        setError(null);
        try {
            const result: DirEntry[] = await invoke("list_directory", { path: p });
            result.sort((a, b) => {
                if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            setEntries(result);
            setPath(p);
        } catch (e: any) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        invoke<string[]>("get_drives").then(setDrives).catch(() => { });
        loadDir(path);
    }, []);

    const navigate = (p: string) => { setFilter(""); loadDir(p); };

    const navigateUp = () => {
        const parts = path.replace(/\\+$/, "").split("\\");
        if (parts.length <= 1) return;
        parts.pop();
        navigate(parts.join("\\") + "\\");
    };

    const handleClick = (entry: DirEntry) => {
        if (entry.is_dir) navigate(entry.path + "\\");
        else if (onFileOpen) onFileOpen(entry.path, false);
        else open(entry.path.slice(0, entry.path.lastIndexOf("\\"))).catch(console.error);
    };

    const breadcrumbs = path.replace(/\\$/, "").split("\\").filter(Boolean);

    const filtered = filter ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase())) : entries;

    return (
        <div className="flex flex-col h-full min-w-0 border-r border-border last:border-r-0">
            {/* toolbar */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
                <button onClick={navigateUp} className="p-1 rounded hover:bg-border text-muted hover:text-white transition-colors" title="Up">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                {/* breadcrumb */}
                <div className="flex-1 flex items-center gap-0.5 text-[11px] font-mono overflow-hidden min-w-0">
                    {breadcrumbs.map((part: string, i: number) => (
                        <span key={i} className="flex items-center gap-0.5 min-w-0">
                            {i > 0 && <span className="text-border shrink-0">›</span>}
                            <button
                                onClick={() => navigate(breadcrumbs.slice(0, i + 1).join("\\") + "\\")}
                                className="text-muted hover:text-white transition-colors truncate max-w-[80px]"
                            >
                                {part}
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {canAdd && (
                        <button onClick={() => onAddPanel(path)} title="Open split panel"
                            className="p-1 rounded hover:bg-border text-muted hover:text-accent transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                            </svg>
                        </button>
                    )}
                    {canClose && (
                        <button onClick={onClose} title="Close panel"
                            className="p-1 rounded hover:bg-border text-muted hover:text-ft-exe transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* filter */}
            <div className="px-2 py-1 border-b border-border shrink-0">
                <input
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter…"
                    className="w-full bg-border/40 text-white text-[11px] rounded px-2 py-0.5 outline-none placeholder-muted font-mono"
                />
            </div>

            {/* drives row */}
            {drives.length > 0 && (
                <div className="flex gap-1 px-2 py-1 border-b border-border shrink-0 overflow-x-auto">
                    {drives.map(d => (
                        <button key={d} onClick={() => navigate(d)}
                            className={`text-[10px] px-2 py-0.5 rounded font-mono shrink-0 transition-colors ${path.startsWith(d) ? "bg-accent text-white" : "bg-border text-muted hover:text-white"}`}>
                            {d.replace("\\", "")}
                        </button>
                    ))}
                </div>
            )}

            {/* entries */}
            <div className="flex-1 overflow-y-auto">
                {loading && (
                    <div className="flex items-center justify-center h-12 text-muted text-xs">Loading…</div>
                )}
                {error && (
                    <div className="px-3 py-2 text-ft-exe text-xs">{error}</div>
                )}
                {!loading && !error && filtered.map(entry => (
                    <div
                        key={entry.path}
                        draggable
                        onDragStart={e => {
                            e.dataTransfer.setData("text/plain", entry.path);
                            e.dataTransfer.effectAllowed = "copyMove";
                        }}
                        onClick={() => handleClick(entry)}
                        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/[0.04] transition-colors group select-none"
                    >
                        <FileEntryIcon is_dir={entry.is_dir} name={entry.name} />
                        <span className="text-[12px] text-white truncate flex-1">{entry.name}</span>
                        {!entry.is_dir && (
                            <span className="text-[10px] text-muted shrink-0 group-hover:opacity-100 opacity-60">
                                {fmtSize(entry.size)}
                            </span>
                        )}
                    </div>
                ))}
                {!loading && !error && filtered.length === 0 && (
                    <div className="text-center text-muted text-xs py-4">Empty</div>
                )}
            </div>
        </div>
    );
}
