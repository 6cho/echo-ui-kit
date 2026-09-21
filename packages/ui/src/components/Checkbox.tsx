import type { ReactNode } from "react";

/**
 * A checkbox drawn to match the rest of the panel, rather than the browser's own.
 *
 * A native checkbox only takes `accent-color`, which tints the checked state and leaves the
 * unchecked box an opaque white square — fine on a light page, a bright hole in a dark one.
 * Everything else here is built from the same translucent borders and brand fill, so the box is
 * drawn from those instead.
 *
 * The real input is still there, just visually hidden: it keeps the native semantics a
 * `role="checkbox"` button only imitates — keyboard toggling, screen-reader announcement, and the
 * label association that makes the whole row clickable. The span beside it is purely decoration,
 * which is why the focus ring has to be forwarded to it from the input's own focus state.
 */
export function Checkbox({
  checked,
  onChange,
  children,
  align = "center",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
  /** "start" when the label runs to more than one line, so the box sits against the first line
   *  rather than floating in the middle of the block. */
  align?: "center" | "start";
}) {
  return (
    <label
      className={`flex w-full cursor-pointer gap-2 text-left ${
        align === "start" ? "items-start" : "items-center"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-1 peer-active:scale-90 dark:peer-focus-visible:ring-offset-surface ${
          align === "start" ? "mt-0.5" : ""
        } ${
          checked
            ? "border-brand-600 bg-brand-600"
            : "border-black/25 dark:border-white/25"
        }`}
      >
        {checked && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-2.5 w-2.5"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      {children}
    </label>
  );
}
