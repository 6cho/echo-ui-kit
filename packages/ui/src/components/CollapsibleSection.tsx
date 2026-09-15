import { type ReactNode, useState } from "react";

/**
 * A titled section that folds away, with its current value shown on the header.
 *
 * The summary is the point: a tool with several property groups is only workable collapsed if you
 * can still see what each group is set to without opening it. Without that you end up expanding
 * sections one by one just to find the one you meant.
 */
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-surface-elevated"
      >
        <span className="w-2 shrink-0 text-[10px] text-zinc-500">
          {isOpen ? "▾" : "▸"}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </span>
        {summary && (
          <span className="ml-auto truncate font-mono text-[11px] text-zinc-500">
            {summary}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="flex flex-col gap-2.5 border-black/10 border-t px-3 py-3 dark:border-white/10">
          {children}
        </div>
      )}
    </div>
  );
}
