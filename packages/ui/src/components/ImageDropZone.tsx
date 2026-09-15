import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useRef,
  useState,
} from "react";

/** Accepts an image by drag-drop, paste, or file browse — the three ways someone actually has a
 *  screenshot to hand. Shared rather than duplicated because palette extraction and the contrast
 *  checker both start from exactly this step, and a paste handler that works in one place but not
 *  the other is the kind of inconsistency nobody reports and everybody notices. */
export function ImageDropZone({
  title,
  subtitle,
  onFile,
}: {
  title: string;
  subtitle: string;
  onFile: (file: File) => void;
}) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    // Reset so picking the exact same file again still fires a change event.
    e.target.value = "";
  }

  function handlePaste(e: ClipboardEvent<HTMLButtonElement>) {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith("image/"),
    );
    const file = item?.getAsFile();
    if (file) onFile(file);
  }

  return (
    <button
      type="button"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={() => fileInputRef.current?.click()}
      title="Click to browse, drag and drop an image, or paste a screenshot"
      className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-6 text-center transition active:scale-[0.98] ${
        isDraggingOver
          ? "border-brand-500 bg-brand-500/5"
          : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 text-zinc-400"
        aria-hidden="true"
      >
        <title>Upload image</title>
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </p>
      <p className="text-[11px] text-zinc-500">{subtitle}</p>
    </button>
  );
}
