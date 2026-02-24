interface Props {
    query: string;
    onChange: (q: string) => void;
    onArrowDown: () => void;
    onEscape: () => void;
    status: "building" | "ready" | "error";
}

export default function SearchBar({ query, onChange, onArrowDown, onEscape, status }: Props) {
    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") { e.preventDefault(); onArrowDown(); }
        if (e.key === "Escape") { e.preventDefault(); onEscape(); }
    };

    return (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
                id="search-input"
                autoFocus
                type="text"
                value={query}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKey}
                placeholder={status === "building" ? "Indexing…" : "Search files and folders…"}
                disabled={status !== "ready"}
                className="flex-1 bg-transparent text-white text-sm placeholder-muted outline-none disabled:cursor-not-allowed disabled:opacity-40 tracking-wide"
                spellCheck={false}
                autoComplete="off"
            />
            {query.length > 0 && (
                <span className="text-xs text-muted font-mono shrink-0">{query.length}</span>
            )}
            {status === "building" && (
                <span className="scan-pulse w-2 h-2 rounded-full bg-accent flex-shrink-0" />
            )}
        </div>
    );
}
