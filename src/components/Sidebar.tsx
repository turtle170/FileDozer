import { open as openDialog } from '@tauri-apps/plugin-dialog';

export type Panel = "search" | "browse" | "settings";

const TOOLS: { id: Panel | "settings"; label: string; icon: () => JSX.Element }[] = [
    {
        id: "search", label: "Search",
        icon: () => (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
        ),
    },
    {
        id: "browse", label: "Files",
        icon: () => (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
        ),
    },
    {
        id: "settings", label: "Settings",
        icon: () => (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
    },
];

interface Props {
    active: Panel;
    onSelect: (p: Panel) => void;
    expanded: boolean;
    onToggle: () => void;
    onOpenEditor: (path: string) => void;
    onOpenCompress: (path: string) => void;
}

export default function Sidebar({ active, onSelect, expanded, onToggle, onOpenEditor, onOpenCompress }: Props) {
    return (
        <div
            className="flex flex-col border-r border-border shrink-0 overflow-hidden transition-all duration-200"
            style={{ width: expanded ? 144 : 44 }}
        >
            {/* hamburger toggle */}
            <button
                onClick={onToggle}
                className="flex items-center justify-center h-9 hover:bg-border/60 transition-colors text-muted hover:text-white shrink-0"
                title={expanded ? "Collapse" : "Expand"}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            <div className="flex-1 flex flex-col gap-0.5 px-1 py-1">
                {TOOLS.map(tool => {
                    const isActive = active === tool.id;
                    return (
                        <button
                            key={tool.id}
                            onClick={() => onSelect(tool.id as Panel)}
                            title={tool.label}
                            className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-100 text-left w-full ${isActive
                                ? "bg-accent/15 text-accent"
                                : "text-muted hover:text-white hover:bg-border/60"
                                }`}
                        >
                            <span className="shrink-0">{tool.icon()}</span>
                            {expanded && (
                                <span className="text-xs font-medium truncate animate-fade-in">
                                    {tool.label}
                                </span>
                            )}
                            {isActive && !expanded && (
                                <span className="absolute left-0 w-0.5 h-6 bg-accent rounded-r" />
                            )}
                        </button>
                    );
                })}

                {expanded && <div className="mt-4 mb-1 px-2 text-[10px] uppercase font-bold text-muted/50 tracking-wider">Tools</div>}
                {!expanded && <div className="mt-4 mb-1 border-t border-border/50 mx-2" />}

                <button
                    onClick={async () => {
                        const selected = await openDialog({ multiple: false, directory: false });
                        if (selected) onOpenEditor(selected as string);
                    }}
                    title="Editor"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-100 text-left w-full text-muted hover:text-white hover:bg-border/60"
                >
                    <span className="shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </span>
                    {expanded && <span className="text-xs font-medium truncate animate-fade-in">Editor</span>}
                </button>

                <button
                    onClick={async () => {
                        const selected = await openDialog({ multiple: false });
                        if (selected) onOpenCompress(selected as string);
                    }}
                    title="Compress/Extract"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-100 text-left w-full text-muted hover:text-white hover:bg-border/60"
                >
                    <span className="shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                        </svg>
                    </span>
                    {expanded && <span className="text-xs font-medium truncate animate-fade-in">Zip / Unzip</span>}
                </button>
            </div>

            {/* bottom: keyboard shortcuts hint */}
            {expanded && (
                <div className="px-3 pb-3 text-[10px] text-muted/50 space-y-0.5 animate-fade-in">
                    <div>Alt+Space — Toggle</div>
                    <div>Enter — Open/Edit</div>
                    <div>Ctrl+E — Edit file</div>
                    <div>Ctrl+S — Save</div>
                </div>
            )}
        </div>
    );
}

