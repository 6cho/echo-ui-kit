import { useState } from "react";

/**
 * The code block every generator ends with: a label (or format tabs), a copy button, and the
 * output itself. Shared because a tool that produces CSS you can't get out of the panel is a toy,
 * so this ending repeats on every one of them — and a copy button that reports success in one
 * tool and silently fails in another is the sort of inconsistency nobody reports.
 */
export function CssOutput({
  code,
  label = "CSS",
  tabs,
  activeTab,
  onTabChange,
}: {
  code: string;
  label?: string;
  /** When given, replaces the label with a segmented control — for generators that emit more than
   *  one representation of the same thing. */
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed", error);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {tabs ? (
          <div className="flex gap-1 clay-inset rounded-md bg-zinc-100 p-0.5 dark:bg-surface-elevated">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={`cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition active:scale-95 ${
                  activeTab === tab.id
                    ? "clay bg-white text-zinc-900 dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={copyToClipboard}
          title="Copy to clipboard"
          className="shrink-0 cursor-pointer clay rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 active:scale-95"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* overflow-x-auto on the <pre> itself, not a wrapper — long declarations shouldn't wrap
          (that would misrepresent the code you're copying) but they can't widen the panel
          either. */}
      <pre className="clay-inset max-h-72 overflow-auto rounded-lg bg-zinc-100 p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-white/10 dark:bg-surface-elevated dark:text-zinc-200">
        {code}
      </pre>
    </div>
  );
}
