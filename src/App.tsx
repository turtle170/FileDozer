import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-shell";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import SearchBar from "./components/SearchBar";
import ResultList from "./components/ResultList";
import StatusBar from "./components/StatusBar";
import FilterChips, { Filter } from "./components/FilterChips";
import RecentSearches from "./components/RecentSearches";
import Editor, { canOpenInEditor } from "./components/Editor";
import Sidebar, { Panel } from "./components/Sidebar";
import FileBrowser from "./components/FileBrowser";
import CompressMenu from "./components/CompressMenu";
import Settings, { loadTheme } from "./components/Settings";

interface SearchResult { path: string; is_dir: boolean; }
interface SearchResponse { results: SearchResult[]; suggestions: SearchResult[]; is_fuzzy: boolean; }
type IndexStatus = "building" | "ready" | "error";

const RECENT_KEY = "filedozer-recent";
const MAX_RECENT = 8;
function loadRecent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } }
function saveRecent(q: string, prev: string[]): string[] {
    const next = [q, ...prev.filter(r => r !== q)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
}

interface BrowsePanel { id: number; path: string; }
let nextPanelId = 1;

function WinBtn({ color, title, onClick }: { color: string; title: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="w-3 h-3 rounded-full flex items-center justify-center group transition-opacity hover:opacity-90 active:scale-95"
            style={{ background: color, boxShadow: `0 0 0 0.5px rgba(0,0,0,0.3)` }}
        >
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-black" style={{ fontSize: 7, lineHeight: 1, fontWeight: 700 }}>
                {color === "#ff5f57" ? "✕" : color === "#febc2e" ? "−" : "⤢"}
            </span>
        </button>
    );
}

export default function App() {
    const [query, setQuery] = useState("");
    const [response, setResponse] = useState<SearchResponse>({ results: [], suggestions: [], is_fuzzy: false });
    const [status, setStatus] = useState<IndexStatus>("building");
    const [filter, setFilter] = useState<Filter>("all");
    const [diskKind, setDiskKind] = useState("");
    const [scanMethod, setScanMethod] = useState("");
    const [indexTime, setIndexTime] = useState(0);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [recentSearches, setRecent] = useState<string[]>(loadRecent);
    const [editorPath, setEditorPath] = useState<string | null>(null);
    const [compressAppTarget, setCompressAppTarget] = useState<{ path: string, is_dir: boolean } | null>(null);
    const [panel, setPanel] = useState<Panel>("search");
    const [sidebarExpanded, setSidebarExpanded] = useState(false);
    const [browsePanels, setBrowsePanels] = useState<BrowsePanel[]>([{ id: nextPanelId++, path: "C:\\" }]);
    const [animating, setAnimating] = useState<"none" | "close" | "minimize" | "maximize">("none");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const listRef = useRef<any>(null);

    // window controls
    const win = getCurrentWindow();
    const closeWin = useCallback(() => { setAnimating("close"); setTimeout(() => win.close(), 400); }, []);
    const minimizeWin = useCallback(() => { setAnimating("minimize"); setTimeout(() => { win.minimize().catch(console.error); setAnimating("none"); }, 500); }, []);
    const maximizeWin = useCallback(() => { setAnimating("maximize"); setTimeout(() => { win.toggleMaximize().catch(console.error); setAnimating("none"); }, 600); }, []);

    useEffect(() => {
        loadTheme();
        register("Alt+Space", async () => {
            const visible = await win.isVisible();
            if (visible) win.hide(); else { win.show(); win.setFocus(); document.getElementById("search-input")?.focus(); }
        }).catch(console.error);

        const poll = setInterval(async () => {
            const s = await invoke<string>("get_index_status");
            if (s === "ready") {
                setStatus("ready"); clearInterval(poll);
                const [kind, method, time] = await Promise.all([
                    invoke<string>("get_disk_info").catch(() => ""),
                    invoke<string>("get_scan_method").catch(() => ""),
                    invoke<number>("get_index_time").catch(() => 0),
                ]);
                setDiskKind(kind); setScanMethod(method); setIndexTime(time);
            } else if (s === "error") { setStatus("error"); clearInterval(poll); }
        }, 400);
        return () => clearInterval(poll);
    }, []);

    const handleSearch = useCallback((q: string) => {
        setQuery(q); setSelectedIdx(0);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (!q.trim()) { setResponse({ results: [], suggestions: [], is_fuzzy: false }); return; }
            const res = await invoke<SearchResponse>("search", { query: q });
            setResponse(res); setSelectedIdx(0);
            if (q.trim().length >= 2 && !res.is_fuzzy && res.results.length > 0)
                setRecent(prev => saveRecent(q.trim(), prev));
        }, 40);
    }, []);

    const displayResults: SearchResult[] = (() => {
        const raw = response.is_fuzzy ? response.suggestions : response.results;
        if (filter === "files") return raw.filter(r => !r.is_dir);
        if (filter === "dirs") return raw.filter(r => r.is_dir);
        return raw;
    })();

    const handleArrowDown = useCallback(() => setSelectedIdx(i => Math.min(i + 1, displayResults.length - 1)), [displayResults.length]);
    const handleEscape = useCallback(() => {
        if (query) handleSearch(""); else win.hide().catch(console.error);
    }, [query, handleSearch]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => { const n = Math.min(i + 1, displayResults.length - 1); listRef.current?.scrollToItem(n, "smart"); return n; }); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => { const n = Math.max(i - 1, 0); listRef.current?.scrollToItem(n, "smart"); return n; }); }
            if (e.key === "Enter" && displayResults[selectedIdx]) {
                const { path, is_dir } = displayResults[selectedIdx];
                if (!is_dir && canOpenInEditor(path)) setEditorPath(path);
                else open(is_dir ? path : path.slice(0, path.lastIndexOf("\\"))).catch(console.error);
            }
            if (e.key === "e" && (e.ctrlKey || e.metaKey) && displayResults[selectedIdx] && !displayResults[selectedIdx].is_dir)
                setEditorPath(displayResults[selectedIdx].path);
            if (e.key === "c" && (e.ctrlKey || e.metaKey) && !e.shiftKey && document.activeElement?.id !== "search-input")
                if (displayResults[selectedIdx]) writeText(displayResults[selectedIdx].path).catch(console.error);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [displayResults, selectedIdx]);

    const addBrowsePanel = (fromPath: string) => {
        if (browsePanels.length < 3) setBrowsePanels(p => [...p, { id: nextPanelId++, path: fromPath }]);
    };
    const removeBrowsePanel = (id: number) => setBrowsePanels(p => p.filter(x => x.id !== id));

    return (
        <div className={`relative flex h-screen glass border border-border/60 rounded-2xl overflow-hidden shadow-glow-accent ${animating === "close" ? "anim-explosion" :
            animating === "minimize" ? "anim-vacuum" :
                animating === "maximize" ? "anim-balloon" : ""
            }`}>
            {/* Editor overlay */}
            {editorPath && <Editor path={editorPath} onClose={() => setEditorPath(null)} />}

            {/* Global Compress Overlay */}
            {compressAppTarget && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <CompressMenu
                        path={compressAppTarget.path}
                        is_dir={compressAppTarget.is_dir}
                        onClose={() => setCompressAppTarget(null)}
                        anchorRef={{ current: null }}
                    />
                </div>
            )}

            {/* Sidebar */}
            <Sidebar
                active={panel}
                onSelect={setPanel}
                expanded={sidebarExpanded}
                onToggle={() => setSidebarExpanded(v => !v)}
                onOpenEditor={(p) => setEditorPath(p)}
                onOpenCompress={async (p) => {
                    // Check if is_dir by invoking the backend file stat. We can reuse 'get_file_info'. If it fails, we assume false. Or just use tauri-plugin-shell to stat, but wait, `get_file_info` returns FileInfo, doesn't tell if dir. Since we know we can just invoke a dummy or change get_file_info. Actually, `get_file_info` returns size 0 for dirs sometimes. Let's just guess is_dir by no extension, or better, we know selected is mostly file. Wait. openDialog({ directory: false }) only returns files. openDialog({ multiple: false }) allows both? No, it only allows files by default unless directory: true. So it's always false for is_dir.
                    setCompressAppTarget({ path: p, is_dir: false });
                }}
            />

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Titlebar */}
                <div className="flex items-center gap-2 px-3 h-8 shrink-0" data-tauri-drag-region>
                    <WinBtn color="#ff5f57" title="Close" onClick={closeWin} />
                    <WinBtn color="#febc2e" title="Minimize" onClick={minimizeWin} />
                    <WinBtn color="#28c840" title="Maximize" onClick={maximizeWin} />
                    <span className="ml-auto text-[10px] font-bold tracking-[0.18em] text-muted/60 select-none">
                        {status === "building" && <span className="shimmer-text">INDEXING</span>}
                        {status === "ready" && "FILEDOZER"}
                        {status === "error" && <span className="text-ft-exe">ERROR</span>}
                    </span>
                </div>

                {/* Search panel */}
                {panel === "search" && (
                    <>
                        <SearchBar query={query} onChange={q => { handleSearch(q); }} onArrowDown={handleArrowDown} onEscape={handleEscape} status={status} />
                        {status === "ready" && <FilterChips value={filter} onChange={f => { setFilter(f); setSelectedIdx(0); }} />}
                        {response.is_fuzzy && query && (
                            <div className="px-4 py-1.5 flex items-center gap-2 bg-yellow-500/8 border-b border-yellow-500/15 shrink-0">
                                <span className="text-yellow-400/90 text-[10px] font-bold tracking-widest">DID YOU MEAN?</span>
                                <code className="text-white text-[11px] bg-border px-1.5 py-0.5 rounded font-mono">{query}</code>
                            </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                            {status === "building" && (
                                <div className="flex flex-col items-center justify-center h-full gap-4">
                                    <div className="relative w-8 h-8">
                                        <span className="absolute inset-0 rounded-full border-2 border-accent/20" />
                                        <span className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-white text-sm font-medium">Building index…</p>
                                        <p className="text-muted text-xs mt-1">Scanning filesystem</p>
                                    </div>
                                </div>
                            )}
                            {status === "error" && (
                                <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8">
                                    <p className="text-ft-exe text-sm font-medium">Failed to access volume</p>
                                    <p className="text-muted text-xs">Run FileDozer as Administrator</p>
                                </div>
                            )}
                            {status === "ready" && query === "" && (
                                <RecentSearches searches={recentSearches} onSelect={handleSearch} onClear={() => { setRecent([]); localStorage.removeItem(RECENT_KEY); }} />
                            )}
                            {status === "ready" && query !== "" && (
                                <ResultList results={displayResults} query={query} isFuzzy={response.is_fuzzy} selectedIndex={selectedIdx} onSelectIndex={setSelectedIdx} listRef={listRef} onOpenFolder={(path) => { setPanel("browse"); setBrowsePanels([{ id: nextPanelId++, path }]); }} />
                            )}
                        </div>
                        {status === "ready" && (
                            <StatusBar count={displayResults.length} diskKind={diskKind} scanMethod={scanMethod} indexTime={indexTime} isFuzzy={response.is_fuzzy} />
                        )}
                    </>
                )}

                {/* Browse panel */}
                {panel === "browse" && (
                    <div className="flex-1 flex overflow-hidden animate-fade-in">
                        {browsePanels.map((bp) => (
                            <FileBrowser
                                key={bp.id}
                                initialPath={bp.path}
                                canAdd={browsePanels.length < 3}
                                canClose={browsePanels.length > 1}
                                onAddPanel={addBrowsePanel}
                                onClose={() => removeBrowsePanel(bp.id)}
                                onFileOpen={(path, is_dir) => {
                                    if (!is_dir && canOpenInEditor(path)) setEditorPath(path);
                                    else open(is_dir ? path : path.slice(0, path.lastIndexOf("\\"))).catch(console.error);
                                }}
                            />
                        ))}
                    </div>
                )}
                {/* Settings panel */}
                {panel === "settings" && <Settings />}

            </div>
        </div>
    );
}
