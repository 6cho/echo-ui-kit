import { Children, type ReactNode } from "react";
import { usePanelColumns } from "../context/PanelLayoutContext";

// What one tool is actually designed for: a column of labelled controls, wide enough that a
// gradient preview reads and narrow enough that a label stays next to its input.
const ONE_COLUMN = "max-w-[500px]";
// Two of those plus the 32px gutter between them. Written out rather than computed because
// Tailwind scans source text — a class assembled at runtime is a class it never generates.
const TWO_COLUMN = "max-w-[1032px]";

/**
 * The panel width at which a second column starts paying for itself: the 1032px of content, the
 * panel's own 16px of padding on each side, and enough left over for a scrollbar and some air.
 * Below it the two columns would be cramped, which is worse than one that works.
 */
export const TWO_COLUMN_MIN_WIDTH = 1096;

type Gap = "4" | "5" | "6";

// Both spellings of the same spacing. Stacked, the gap belongs to the container; flowed across
// columns there is no container to put it on, so each section carries its own bottom margin.
const STACK_GAP: Record<Gap, string> = {
  "4": "gap-4",
  "5": "gap-5",
  "6": "gap-6",
};
const FLOW_GAP: Record<Gap, string> = {
  "4": "mb-4",
  "5": "mb-5",
  "6": "mb-6",
};

/**
 * A tool's top-level stack of sections, which becomes two balanced columns when the panel is wide
 * enough for them.
 *
 * Uses real CSS multi-column rather than a two-column grid because the columns have to *balance*.
 * A grid places items row by row, so a short section beside a tall one leaves a hole and the two
 * sides drift out of step. Multi-column lets the browser pick the break point by measuring, which
 * is the one thing that can't be done from here — section heights depend on state (a collapsed
 * panel, a palette of 4 colors or 16) and change while you work.
 *
 * Each section is wrapped and told not to break, so a control group is never split down the
 * middle of itself. The wrappers exist in both layouts, identical in structure and differing only
 * in class, so crossing the width threshold re-styles the tree instead of rebuilding it —
 * otherwise a resize would remount every tool and throw away whatever was loaded into it.
 */
export function ToolColumns({
  gap = "4",
  className = "",
  children,
}: {
  gap?: Gap;
  className?: string;
  children: ReactNode;
}) {
  const columns = usePanelColumns();
  const isSplit = columns >= 2;

  // `false` from a `{condition && <Section/>}` arrives here as null. Skipping it keeps an empty
  // wrapper — and its margin — from opening a gap where a hidden section would have been.
  const sections = Children.map(children, (child) =>
    child ? (
      <div className={isSplit ? `${FLOW_GAP[gap]} break-inside-avoid` : ""}>
        {child}
      </div>
    ) : null,
  );

  return (
    <div
      className={`mx-auto w-full ${
        isSplit
          ? `${TWO_COLUMN} columns-2 gap-8`
          : `${ONE_COLUMN} flex flex-col ${STACK_GAP[gap]}`
      } ${className}`}
    >
      {sections}
    </div>
  );
}

/**
 * The same width cap without the splitting, for the parts of a tool that shouldn't flow — a
 * pinned footer, a mode switch sitting above two alternative views.
 *
 * Kept in step with ToolColumns so a footer lines up with the content scrolling above it.
 */
export function ToolWidth({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const columns = usePanelColumns();
  return (
    <div
      className={`mx-auto w-full ${columns >= 2 ? TWO_COLUMN : ONE_COLUMN} ${className}`}
    >
      {children}
    </div>
  );
}
