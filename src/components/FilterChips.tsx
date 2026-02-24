type Filter = "all" | "files" | "dirs";

interface Props {
    value: Filter;
    onChange: (f: Filter) => void;
}

const CHIPS: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Files", value: "files" },
    { label: "Folders", value: "dirs" },
];

export default function FilterChips({ value, onChange }: Props) {
    return (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border">
            {CHIPS.map((c) => (
                <button
                    key={c.value}
                    onClick={() => onChange(c.value)}
                    className={`filter-chip ${value === c.value ? "filter-chip-active" : "filter-chip-idle"}`}
                >
                    {c.label}
                </button>
            ))}
        </div>
    );
}

export type { Filter };
