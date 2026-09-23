import { useRef, useState } from "react";
import { useDismissable } from "../lib/useDismissable";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Renders in red — for the one action in a menu that destroys something. */
  destructive?: boolean;
}

// Rough per-item height plus the menu's own vertical padding, used only to guess whether the menu
// would run off the bottom of the window. It doesn't need to be exact: being a few pixels out
// just means flipping direction slightly earlier or later than strictly necessary.
const ESTIMATED_ITEM_HEIGHT = 33;
const MENU_VERTICAL_PADDING = 8;

/**
 * The overflow menu used wherever a row has more than one action but not enough room to show
 * them. Opens away from the nearest window edge, because both places this is used sit in tight
 * spots — a pinned footer, and a scrollable list whose overflow would clip a menu opening the
 * wrong way (an absolutely-positioned dropdown adds no scroll height, so the container can't
 * scroll to reveal it — it just gets cut off).
 */
export function ThreeDotMenu({ items }: { items: MenuItem[] }) {
  const {
    isOpen,
    setIsOpen,
    ref: containerRef,
  } = useDismissable<HTMLDivElement>();
  const [opensUpward, setOpensUpward] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!isOpen) {
      const rect = triggerRef.current?.getBoundingClientRect();
      const needed =
        items.length * ESTIMATED_ITEM_HEIGHT + MENU_VERTICAL_PADDING;
      setOpensUpward(rect ? window.innerHeight - rect.bottom < needed : false);
    }
    setIsOpen((open) => !open);
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-200 active:scale-90 dark:text-zinc-300 dark:hover:bg-surface-hover"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <title>More actions</title>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 z-20 flex w-36 flex-col overflow-hidden clay rounded-lg border border-black/10 bg-white py-1 dark:border-white/10 dark:bg-surface-elevated ${
            opensUpward ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onSelect();
                setIsOpen(false);
              }}
              className={`cursor-pointer px-3 py-2 text-left text-xs font-medium transition hover:bg-zinc-100 dark:hover:bg-surface-hover ${
                item.destructive
                  ? "text-red-600 dark:text-red-400"
                  : "text-zinc-700 dark:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
