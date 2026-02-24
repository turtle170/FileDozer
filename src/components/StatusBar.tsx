interface Props {
    count: number;
    diskKind: string;
    scanMethod: string;
    indexTime: number;
    isFuzzy: boolean;
}

export default function StatusBar({ count, diskKind, scanMethod, indexTime, isFuzzy }: Props) {
    return (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border text-[11px] text-muted select-none shrink-0">
            <span className="text-muted-light font-medium">
                {count > 0 ? `${count.toLocaleString()} result${count === 1 ? "" : "s"}${isFuzzy ? " (similar)" : ""}` : ""}
            </span>
            <span className="ml-auto flex items-center gap-2">
                {diskKind && (
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-ft-code" />
                        {diskKind}
                    </span>
                )}
                {scanMethod && (
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        {scanMethod}
                    </span>
                )}
                {indexTime > 0 && (
                    <span className="text-muted/60">indexed in {indexTime}s</span>
                )}
            </span>
        </div>
    );
}
