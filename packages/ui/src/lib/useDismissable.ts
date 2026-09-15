import { useEffect, useRef, useState } from "react";

/**
 * Open/closed state for a popover, plus a ref to attach to whatever should count as "inside."
 * Clicking anywhere outside that element, or pressing Escape, closes it.
 *
 * Owns the state rather than taking an `isOpen` prop specifically so the effect can depend on
 * React's stable `setIsOpen` — a caller passing an inline `() => setOpen(false)` would hand over a
 * new function every render, re-subscribing the document listeners each time the component
 * renders while open.
 */
export function useDismissable<T extends HTMLElement>() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return { isOpen, setIsOpen, ref };
}
