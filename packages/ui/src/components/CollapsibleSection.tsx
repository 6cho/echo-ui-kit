import { type ReactNode, useState } from "react";

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? `${label} is included` : `${label} is left out`}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 cursor-pointer rounded-full transition ${
        checked ? "bg-brand-600" : "bg-zinc-300 dark:bg-zinc-600"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-300 ${checked ? "translate-x-3" : ""}`}
      />
    </button>
  );
}

/**
 * A titled section that folds away, optionally with a switch controlling whether the property it
 * holds is used at all.
 *
 * The summary is the point of the header: a tool with several property groups is only workable
 * collapsed if you can still see what each is set to without opening it. Without that you end up
 * expanding sections one by one just to find the one you meant.
 *
 * A switched-off section hides its body rather than dimming it, so there's never a moment of
 * editing controls that aren't doing anything.
 */
export function CollapsibleSection({
  title,
  summary,
  headerAction,
  defaultOpen = false,
  enabled = true,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  /** A control pinned to the header, beside the switch — for the one action worth reaching
   *  without expanding the section. Must not be a plain button's child, so it sits as a sibling
   *  of the expand button rather than inside it. */
  headerAction?: ReactNode;
  defaultOpen?: boolean;
  /** Only meaningful alongside onToggle; without it the section is always on. */
  enabled?: boolean;
  onToggle?: (next: boolean) => void;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const showBody = isOpen && enabled;
  // The body is built the first time it opens and kept from then on, so it has a height to close
  // from — a body that unmounted the moment it was folded would vanish instead of folding away.
  const [hasOpened, setHasOpened] = useState(showBody);
  if (showBody && !hasOpened) setHasOpened(true);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      {/* The switch is a sibling of the expand button, not inside it — a button can't contain
          another button, and toggling a property shouldn't also fold its section.
          The hover background belongs to this row rather than to the button: on the button it
          stopped at the button's own edge, leaving the switch and the padding beside it
          unhighlighted and tearing the row in half. */}
      <div
        className={`flex items-center gap-2 pr-3 transition ${
          enabled ? "hover:bg-zinc-100 dark:hover:bg-surface-elevated" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={showBody}
          disabled={!enabled}
          className={`flex flex-1 items-center gap-2 px-3 py-2 text-left ${
            enabled ? "cursor-pointer" : "cursor-not-allowed"
          }`}
        >
          <span className="w-2 shrink-0 text-[10px] text-zinc-500">
            {enabled ? (isOpen ? "▾" : "▸") : ""}
          </span>
          <span
            className={`text-[11px] font-medium uppercase tracking-wide ${
              enabled ? "text-zinc-500" : "text-zinc-400 dark:text-zinc-600"
            }`}
          >
            {title}
          </span>
          <span
            className={`ml-auto truncate font-mono text-[11px] ${
              enabled ? "text-zinc-500" : "text-zinc-400 dark:text-zinc-600"
            }`}
          >
            {enabled ? summary : "off"}
          </span>
        </button>
        {enabled && headerAction}
        {onToggle && (
          <Switch checked={enabled} label={title} onChange={onToggle} />
        )}
      </div>
      {/* Folds by animating a one-row grid between 0fr and 1fr, which tracks the body's real
          height without measuring it. The contents fade a beat behind the fold, so they are never
          seen squashed against its edge. */}
      <div
        className="grid transition-[grid-template-rows] duration-[360ms] ease-fluid"
        style={{ gridTemplateRows: showBody ? "1fr" : "0fr" }}
        inert={!showBody}
      >
        <div className="min-h-0 overflow-hidden">
          {hasOpened && (
            <div
              className={`flex flex-col gap-2.5 border-black/10 border-t px-3 py-3 transition-opacity duration-300 dark:border-white/10 ${
                showBody ? "opacity-100 delay-75" : "opacity-0"
              }`}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
