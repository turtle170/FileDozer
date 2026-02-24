import { FixedSizeList as List } from "react-window";
import { open } from "@tauri-apps/plugin-shell";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { invoke } from "@tauri-apps/api/core";
import CompressMenu from "./CompressMenu";
import { useState, useRef, useCallback, useEffect } from "react";

interface SearchResult { path: string; is_dir: boolean; }

interface Props {
    results: SearchResult[];
    query: string;
    isFuzzy?: boolean;
    selectedIndex: number;
    onSelectIndex: (i: number) => void;
    listRef: React.RefObject<any>;
    onOpenFolder?: (path: string) => void;
}

function fileTypeColor(name: string, is_dir: boolean): string {
    if (is_dir) return "text-ft-folder";
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["rs", "js", "ts", "tsx", "jsx", "py", "go", "cpp", "c", "h", "java", "cs", "rb", "php", "swift", "kt"].includes(ext)) return "text-ft-code";
    if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "avif"].includes(ext)) return "text-ft-image";
    if (["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"].includes(ext)) return "text-ft-video";
    if (["mp3", "wav", "flac", "ogg", "aac", "m4a"].includes(ext)) return "text-ft-audio";
    if (["pdf", "doc", "docx", "txt", "md", "rtf", "odt", "xlsx", "xls", "pptx", "ppt"].includes(ext)) return "text-ft-doc";
    if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst"].includes(ext)) return "text-ft-archive";
    if (["exe", "msi", "bat", "cmd", "ps1", "sh"].includes(ext)) return "text-ft-exe";
    return "text-ft-generic";
}

function FileIcon({ name, is_dir }: { name: string; is_dir: boolean }) {
    if (is_dir) {
        return (
            <svg className="w-4 h-4 text-ft-folder flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
        );
    }
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const color = fileTypeColor(name, false);

    if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "avif"].includes(ext)) {
        return (
            <svg className={`w-4 h-4 flex-shrink-0 ${color}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
        );
    }
    if (["mp4", "mkv", "avi", "mov", "wmv", "webm"].includes(ext)) {
        return (
            <svg className={`w-4 h-4 flex-shrink-0 ${color}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
        );
    }
    return (
        <svg className={`w-4 h-4 flex-shrink-0 ${color}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
    );
}

function highlight(text: string, query: string): React.ReactNode {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-accent/30 text-white rounded-sm px-0.5 not-italic">{text.slice(idx, idx + query.length)}</mark>
            {text.slice(idx + query.length)}
        </>
    );
}

function basename(path: string) { return path.split("\\").pop() ?? path; }
function dirname(path: string, name: string) { return path.slice(0, path.length - name.length - 1); }

function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function formatDate(timestamp: number) {
    if (!timestamp) return "";
    return new Date(timestamp * 1000).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface RowData {
    items: SearchResult[];
    query: string;
    isFuzzy: boolean;
    selectedIndex: number;
    onSelectIndex: (i: number) => void;
    openCompress: (path: string, is_dir: boolean, ref: React.RefObject<HTMLElement>) => void;
    onOpenFolder?: (path: string) => void;
}

function Row({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) {
    const { path, is_dir } = data.items[index];
    const name = basename(path);
    const dir = dirname(path, name);
    const selected = index === data.selectedIndex;

    const [info, setInfo] = useState<{ size: number, modified: number } | null>(null);
    useEffect(() => {
        let mounted = true;
        invoke<{ size: number, modified: number }>("get_file_info", { path }).then(res => {
            if (mounted && res) setInfo(res);
        }).catch(() => { });
        return () => { mounted = false; };
    }, [path]);

    const handleOpen = () => {
        if (is_dir && data.onOpenFolder) {
            data.onOpenFolder(path);
        } else {
            open(path).catch(console.error);
        }
    };
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        writeText(path).catch(console.error);
    };
    const archiveBtnRef = useRef<HTMLButtonElement>(null);
    const handleArchive = (e: React.MouseEvent) => {
        e.stopPropagation();
        data.openCompress(path, is_dir, archiveBtnRef as React.RefObject<HTMLElement>);
    };

    return (
        <div
            style={style}
            className={`result-row group flex items-center gap-3 px-4 cursor-pointer transition-colors duration-75
                ${selected ? "selected-row" : "hover:bg-white/[0.04]"}`}
            onClick={handleOpen}
            onMouseEnter={() => data.onSelectIndex(index)}
        >
            <FileIcon name={name} is_dir={is_dir} />
            <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm text-white truncate flex items-center gap-1.5 font-medium">
                    {data.isFuzzy && <span className="text-yellow-400 text-[10px] font-bold shrink-0">~</span>}
                    {highlight(name, data.query)}
                </span>
                <span className="text-[11px] text-muted truncate font-mono">{dir}</span>
            </div>
            {info && (
                <div className="flex flex-col items-end text-[10px] text-muted font-mono shrink-0 pr-2">
                    <span>{formatDate(info.modified)}</span>
                    {!is_dir && <span>{formatSize(info.size)}</span>}
                </div>
            )}
            <button
                className="copy-btn shrink-0"
                title="Copy path"
                onClick={handleCopy}
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            </button>
            <button
                ref={archiveBtnRef}
                className="copy-btn shrink-0 relative"
                title="Compress / Extract"
                onClick={handleArchive}
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                </svg>
            </button>
        </div>
    );
}

export default function ResultList({ results, query, isFuzzy = false, selectedIndex, onSelectIndex, listRef, onOpenFolder }: Props) {
    const [compressTarget, setCompressTarget] = useState<{ path: string; is_dir: boolean } | null>(null);

    const openCompress = useCallback((path: string, is_dir: boolean) => {
        setCompressTarget({ path, is_dir });
    }, []);

    if (results.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm animate-fade-in">
                {query ? "No results" : "Start typing to search…"}
            </div>
        );
    }
    return (
        <div className="relative h-full">
            <List
                ref={listRef}
                height={380}
                itemCount={results.length}
                itemSize={48}
                width="100%"
                itemData={{ items: results, query, isFuzzy, selectedIndex, onSelectIndex, openCompress, onOpenFolder }}
            >
                {Row}
            </List>
            {compressTarget && (
                <div className="absolute bottom-2 right-2">
                    <CompressMenu
                        path={compressTarget.path}
                        is_dir={compressTarget.is_dir}
                        onClose={() => setCompressTarget(null)}
                        anchorRef={{ current: null }}
                    />
                </div>
            )}
        </div>
    );
}
