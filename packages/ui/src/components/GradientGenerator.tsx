import {
  formatGradient,
  formatGradientCss,
  type Gradient,
} from "@echo-ui-kit/tools-core";
import { useMemo, useState } from "react";
import { CssOutput } from "./CssOutput";
import { DEFAULT_GRADIENT, GradientControls } from "./GradientControls";

export function GradientGenerator({
  paletteColors,
}: {
  paletteColors: string[];
}) {
  const [gradient, setGradient] = useState<Gradient>(DEFAULT_GRADIENT);

  const value = useMemo(() => formatGradient(gradient), [gradient]);
  const css = useMemo(() => formatGradientCss(gradient), [gradient]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        className="h-40 rounded-lg border border-black/10 dark:border-white/10"
        style={{ background: value }}
      />

      <div className="flex flex-col gap-2.5">
        <GradientControls
          gradient={gradient}
          paletteColors={paletteColors}
          onChange={setGradient}
        />
      </div>

      <CssOutput code={css} />
    </div>
  );
}
