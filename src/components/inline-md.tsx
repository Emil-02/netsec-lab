import { Fragment } from "react";

/** Renders a tiny subset of markdown: `code`, **bold**, *italic*. */
export function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`"))
          return (
            <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-accent">
              {part.slice(1, -1)}
            </code>
          );
        if (part.startsWith("**")) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        if (part.startsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
