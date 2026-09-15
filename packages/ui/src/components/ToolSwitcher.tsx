import { useDismissable } from "../lib/useDismissable";

export interface ToolOption {
  id: string;
  label: string;
  description: string;
}

/**
 * The app's top-level navigation — one dropdown that swaps the whole panel between major tools,
 * so each one gets the full surface to itself instead of competing for room in a tab strip that
 * can't grow past three or four items in a side panel this narrow.
 *
 * Deliberately not a native `<select>`: the options carry a description line explaining what each
 * tool does, which a native option element can't render. That matters most on first use, when the
 * tool names alone ("Contrast", "Export") don't say what you'd find inside.
 */
export function ToolSwitcher({
  tools,
  activeId,
  onChange,
}: {
  tools: ToolOption[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const {
    isOpen,
    setIsOpen,
    ref: containerRef,
  } = useDismissable<HTMLDivElement>();
  const active = tools.find((tool) => tool.id === activeId);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        title="Switch tool"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 bg-zinc-100 py-1.5 pr-2 pl-2.5 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200 active:scale-95 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-100 dark:hover:bg-surface-hover"
      >
        <span className="whitespace-nowrap">{active?.label ?? "Tools"}</span>
        <span className="text-[10px] text-zinc-500">▾</span>
      </button>

      {isOpen && (
        <div
          // Right-anchored so it grows leftward into the panel rather than off the edge — this
          // sits at the far right of the header, and the menu is wider than its trigger.
          className="absolute right-0 z-20 mt-1 flex w-56 flex-col overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-surface-elevated"
        >
          {tools.map((tool) => {
            const isActive = tool.id === activeId;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  onChange(tool.id);
                  setIsOpen(false);
                }}
                className={`flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-left transition ${
                  isActive
                    ? "bg-zinc-100 dark:bg-surface-hover"
                    : "hover:bg-zinc-100 dark:hover:bg-surface-hover"
                }`}
              >
                <span
                  className={`text-xs font-medium ${
                    isActive
                      ? "text-brand-600 dark:text-brand-500"
                      : "text-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {tool.label}
                </span>
                <span className="text-[11px] leading-snug text-zinc-500">
                  {tool.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
