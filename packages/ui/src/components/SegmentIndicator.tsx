import { useLayoutEffect, useRef, useState } from "react";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The raised pill behind a segmented control's selected option, which slides to the next one
 * rather than vanishing from one and appearing on the other. Swapping a background between
 * buttons reads as two things happening; one surface travelling reads as the control having
 * moved, which is what it did.
 *
 * Dropped in as the first child of the control's (positioned) container, it finds the option
 * marked `data-active="true"` itself and follows it — so a control only has to say which option
 * is selected, which it already did to style it. It re-measures when the selection changes and
 * when the control resizes, so it never lands on where an option used to be.
 *
 * It appears in place the first time rather than sliding in from the corner.
 */
export function SegmentIndicator({
  className = "rounded-md",
}: {
  /** The options' corner radius, so the pill matches the shape it sits behind. */
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [isPlaced, setIsPlaced] = useState(false);

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const measure = () => {
      const active = parent.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) {
        setBox(null);
        return;
      }
      setBox((current) => {
        const next = {
          left: active.offsetLeft,
          top: active.offsetTop,
          width: active.offsetWidth,
          height: active.offsetHeight,
        };
        return current &&
          current.left === next.left &&
          current.top === next.top &&
          current.width === next.width &&
          current.height === next.height
          ? current
          : next;
      });
    };

    measure();
    const mutations = new MutationObserver(measure);
    mutations.observe(parent, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-active"],
    });
    const resizes = new ResizeObserver(measure);
    resizes.observe(parent);
    return () => {
      mutations.disconnect();
      resizes.disconnect();
    };
  }, []);

  // Transitions switch on only after the first placement has painted, so the pill starts where
  // the selection is instead of gliding there from 0,0.
  useLayoutEffect(() => {
    if (!box || isPlaced) return;
    const frame = requestAnimationFrame(() => setIsPlaced(true));
    return () => cancelAnimationFrame(frame);
  }, [box, isPlaced]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`clay pointer-events-none absolute top-0 left-0 bg-white dark:bg-zinc-700 ${className} ${
        isPlaced
          ? "transition-[transform,width,height,opacity] duration-[380ms] ease-fluid"
          : ""
      }`}
      style={{
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        transform: box ? `translate(${box.left}px, ${box.top}px)` : undefined,
        opacity: box ? 1 : 0,
      }}
    />
  );
}
