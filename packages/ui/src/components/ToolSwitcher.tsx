import { useDismissable } from "../lib/useDismissable";

export interface ToolOption {
  id: string;
  label: string;
  description: string;
  /** Which section of the menu this sits under. Tools are shown in the order given, grouped by
   *  first appearance of each group name. */
  group: string;
}

/**
 * The app's top-level navigation — one dropdown that swaps the whole panel between major tools,
 * so each one gets the full surface to itself instead of competing for room in a tab strip that
 * can't grow past three or four items in a side panel this narrow.
 *
 * Grouped rather than flat: a dozen-odd tools in one undifferentiated list is a wall to read every
 * time you switch, whereas section headings let you skip to the third of the menu you want. The
 * groups also carry real information — they say a tool works on your palette rather than on the
 * page you're looking at, which is the distinction that decides whether it needs the page open.
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

  const groups: { name: string; tools: ToolOption[] }[] = [];
  for (const tool of tools) {
    const existing = groups.find((g) => g.name === tool.group);
    if (existing) existing.tools.push(tool);
    else groups.push({ name: tool.group, tools: [tool] });
  }

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
          // Left-anchored, because the trigger sits at the left edge of its panel's header and
          // the menu is wider than it — anchoring right would grow the menu leftward, straight
          // off the panel, where it gets clipped. Capped and scrollable since the list is long
          // enough to outgrow a short viewport.
          className="absolute left-0 z-20 mt-1 flex max-h-[70vh] w-60 flex-col overflow-y-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-surface-elevated"
        >
          {groups.map((group) => (
            <div key={group.name} className="flex flex-col">
              <span className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {group.name}
              </span>
              {group.tools.map((tool) => {
                const isActive = tool.id === activeId;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      onChange(tool.id);
                      setIsOpen(false);
                    }}
                    className={`flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-left transition ${
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
          ))}
        </div>
      )}
    </div>
  );
}
