interface Props {
    searches: string[];
    onSelect: (q: string) => void;
    onClear: () => void;
}

export default function RecentSearches({ searches, onSelect, onClear }: Props) {
    if (searches.length === 0) return null;
    return (
        <div className="px-4 py-3 animate-slide-up">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted font-medium uppercase tracking-widest">Recent</span>
                <button
                    onClick={onClear}
                    className="text-[11px] text-muted hover:text-white transition-colors"
                >
                    Clear
                </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {searches.map((s) => (
                    <button
                        key={s}
                        onClick={() => onSelect(s)}
                        className="px-2.5 py-1 rounded-full text-xs bg-border hover:bg-accent/20 text-muted-light hover:text-white transition-colors duration-100 font-mono"
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
    );
}
