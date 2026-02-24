import { invoke } from "@tauri-apps/api/core";
import { useState, useRef, useEffect } from "react";

interface Props {
    path: string;
    is_dir: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement>;
}

type Format = string;
type Mode = "compress" | "extract";

interface CompressResult {
    output_path: string;
    original_bytes: number;
    compressed_bytes: number;
    ratio: number;
}

const FORMATS: { id: Format; label: string; ext: string; desc: string; color: string }[] = [
    { id: "zip", label: ".ZIP", ext: "zip", desc: "Universal format", color: "text-ft-archive" },
    { id: "dozip", label: ".DZ", ext: "dz", desc: "FileDozer MAX (Zstd)", color: "text-accent" },
    { id: "7z", label: ".7Z", ext: "7z", desc: "Highest ratio (needs 7-Zip)", color: "text-ft-video" },
    { id: "br", label: ".BR", ext: "br", desc: "Brotli (Best for Text)", color: "text-orange-400" },
    { id: "zst", label: ".ZST", ext: "zst", desc: "Zstandard Level 21", color: "text-cyan-400" },
    { id: "xz", label: ".XZ", ext: "xz", desc: "LZMA Single", color: "text-purple-400" },
    { id: "bz2", label: ".BZ2", ext: "bz2", desc: "Bzip2 Single", color: "text-indigo-400" },
    { id: "gz", label: ".GZ", ext: "gz", desc: "Gzip Single", color: "text-blue-400" },
    { id: "tar.gz", label: ".TAR.GZ", ext: "tar.gz", desc: "Linux Tar GZ", color: "text-ft-audio" },
    { id: "tar.br", label: ".TAR.BR", ext: "tar.br", desc: "Tar Brotli Text", color: "text-orange-500" },
    { id: "tar.zst", label: ".TAR.ZST", ext: "tar.zst", desc: "Tar Zstd Ultra", color: "text-cyan-500" },
    { id: "tar.xz", label: ".TAR.XZ", ext: "tar.xz", desc: "Tar LZMA", color: "text-purple-500" },
    { id: "tar.bz2", label: ".TAR.BZ2", ext: "tar.bz2", desc: "Tar Bzip2", color: "text-indigo-500" },
];

function fmt(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export default function CompressMenu({ path, onClose }: Props) {
    const isArchive = [".zip", ".tar.gz", ".tgz", ".7z", ".dz", ".gz", ".tar"].some(ext => path.toLowerCase().endsWith(ext));

    const [mode, setMode] = useState<Mode>(isArchive ? "extract" : "compress");
    const [format, setFormat] = useState<Format>("zip");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<CompressResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lossy, setLossy] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
        };
        setTimeout(() => document.addEventListener("mousedown", handler), 0);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    const handleStart = async () => {
        setBusy(true);
        setResult(null);
        setError(null);

        try {
            if (mode === "compress") {
                const ext = FORMATS.find(f => f.id === format)!.ext;
                const output: string = await invoke("get_auto_output_path", { inputPath: path, ext });

                let res: CompressResult;
                if (format === "zip") res = await invoke("compress_zip", { paths: [path], output });
                else if (format === "tar.gz") res = await invoke("compress_tar_gz", { paths: [path], output });
                else if (format === "7z") res = await invoke("compress_7z", { paths: [path], output });
                else if (format === "dozip") res = await invoke("compress_dozip", { path, output, lossy });
                else res = await invoke("compress_generic", { paths: [path], output, format });
                setResult(res);
            } else {
                const dir = path.slice(0, path.lastIndexOf("\\"));
                await invoke("decompress", { path, outputDir: dir });
                setResult({
                    output_path: dir,
                    original_bytes: 0,
                    compressed_bytes: 0,
                    ratio: 1.0
                });
            }
        } catch (e: any) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };

    const fileName = path.split("\\").pop() || "";

    return (
        <div
            ref={menuRef}
            className="relative w-[480px] rounded-xl border border-border bg-panel shadow-glow-accent overflow-hidden animate-slide-up"
            style={{ fontSize: "12px" }}
        >
            <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-panel">
                <span className="text-white font-semibold flex items-center gap-2">
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                    </svg>
                    FileDozer Zip Tool
                </span>
                <button onClick={onClose} className="text-muted hover:text-white transition-colors">✕</button>
            </div>

            <div className="px-4 py-3 border-b border-border/50 bg-black/20">
                <p className="text-[11px] font-mono text-muted-light truncate" title={path}>{fileName}</p>
            </div>

            {!result && !error && (
                <div className="p-3">
                    <div className="flex bg-black/40 rounded-lg p-1 mb-4">
                        <button
                            onClick={() => setMode("compress")}
                            className={`flex-1 py-1.5 text-center rounded-md font-medium transition-colors ${mode === "compress" ? "bg-accent text-white shadow" : "text-muted hover:text-white"}`}
                        >
                            Compress
                        </button>
                        <button
                            onClick={() => setMode("extract")}
                            disabled={!isArchive}
                            className={`flex-1 py-1.5 text-center rounded-md font-medium transition-colors ${mode === "extract" ? "bg-accent text-white shadow" : "text-muted hover:text-white"} ${!isArchive ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            Extract
                        </button>
                    </div>

                    {mode === "compress" && (
                        <div className="space-y-2 mb-4">
                            <label className="text-xs text-muted font-bold tracking-wider uppercase">Format</label>
                            <div className="grid grid-cols-3 gap-2 h-48 overflow-y-auto pr-2 custom-scrollbar">
                                {FORMATS.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setFormat(f.id)}
                                        className={`flex flex-col items-start p-2 rounded-lg border text-left transition-colors ${format === f.id ? "border-accent bg-accent/10" : "border-border hover:border-muted/50"}`}
                                    >
                                        <span className={`font-bold ${f.color}`}>{f.label}</span>
                                        <span className="text-[9px] leading-[1.1] mt-0.5 text-muted line-clamp-2">{f.desc}</span>
                                    </button>
                                ))}
                            </div>

                            {format === "dozip" && (
                                <label className="flex items-center gap-2 pt-1 cursor-pointer text-muted hover:text-white transition-colors text-xs">
                                    <input type="checkbox" checked={lossy} onChange={e => setLossy(e.target.checked)} className="accent-accent" />
                                    Lossy text optimization
                                </label>
                            )}
                        </div>
                    )}

                    {mode === "extract" && (
                        <div className="space-y-2 mb-4 p-3 bg-black/20 rounded-lg border border-border/50">
                            <p className="text-muted-light">FileDozer will automatically detect the archive type and extract the contents to the current directory.</p>
                        </div>
                    )}

                    <button
                        disabled={busy}
                        onClick={handleStart}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent hover:bg-accent-bright text-white font-bold transition-colors disabled:opacity-50"
                    >
                        {busy ? (
                            <>
                                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                Processing...
                            </>
                        ) : (
                            mode === "compress" ? "Start Compression" : "Start Extraction"
                        )}
                    </button>
                </div>
            )}

            {result && (
                <div className="p-4 space-y-3 animate-fade-in text-center">
                    <div className="w-12 h-12 rounded-full bg-accent/20 text-accent flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="text-white font-bold text-lg">Success!</div>
                    {mode === "compress" ? (
                        <div className="text-muted space-y-1 font-mono text-xs">
                            <div>Saved as: {result.output_path.split("\\").pop()}</div>
                            <div>{fmt(result.original_bytes)} → {fmt(result.compressed_bytes)}</div>
                            <div className="text-accent font-bold">{(result.ratio * 100).toFixed(1)}% ratio</div>
                        </div>
                    ) : (
                        <div className="text-muted text-xs">
                            Files extracted successfully to {result.output_path.split("\\").pop()}
                        </div>
                    )}
                    <button onClick={onClose} className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors">Close</button>
                </div>
            )}

            {error && (
                <div className="p-4 space-y-3 animate-fade-in text-center">
                    <div className="w-12 h-12 rounded-full bg-ft-exe/20 text-ft-exe flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <div className="text-ft-exe font-bold text-lg">Error</div>
                    <div className="text-muted text-[11px] break-words bg-black/40 p-2 rounded-lg text-left overflow-y-auto max-h-32">{error}</div>
                    <button onClick={() => setError(null)} className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors">Try Again</button>
                </div>
            )}
        </div>
    );
}
