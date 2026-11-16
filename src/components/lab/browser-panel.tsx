"use client";

import { ChevronLeft, ChevronRight, Code, Globe, Lock, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLab } from "./lab-context";

/**
 * Locks down rendered lab pages: the iframe is sandboxed (no scripts, no forms,
 * no navigation) and a CSP blocks every network request from the page.
 */
const GUARD = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>a,button,input,select,textarea{pointer-events:none}</style>`;

export function BrowserPanel() {
  const pages = useLab((s) => s.pages);
  const current = useLab((s) => s.currentPage);
  const showPage = useLab((s) => s.showPage);
  const [source, setSource] = useState(false);
  const page = current !== null ? pages[current] : undefined;
  const srcDoc = useMemo(() => (page ? GUARD + page.html : ""), [page]);

  if (!page) {
    return (
      <div className="grid h-full place-items-center p-4 text-center text-sm text-muted">
        <p>
          Belum ada halaman. Buka halaman web dengan perintah <code className="mx-1 text-accent">browser http://alamat/</code> di terminal.
        </p>
      </div>
    );
  }

  const secure = page.url.startsWith("https://");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30"
          disabled={!current}
          onClick={() => showPage((current ?? 0) - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30"
          disabled={current === pages.length - 1}
          onClick={() => showPage((current ?? 0) + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-slate-300">
          {secure ? <Lock className="size-3 shrink-0 text-emerald-400" /> : <Globe className="size-3 shrink-0 text-muted" />}
          <span className="truncate" title={page.url}>
            {page.url}
          </span>
        </div>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", page.status < 400 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")}>
          {page.status}
        </span>
        <button
          className={cn("flex items-center gap-1 rounded px-2 py-1 text-[11px]", source ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface-2")}
          onClick={() => setSource((v) => !v)}
        >
          <Code className="size-3.5" /> Sumber
        </button>
      </div>
      {page.scripts.length > 0 && (
        <div className="flex gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
          <TriangleAlert className="size-4 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <div className="font-semibold">Browser sungguhan akan MENJALANKAN skrip di halaman ini:</div>
            {page.scripts.slice(0, 3).map((s, i) => (
              <code key={i} className="block truncate font-mono text-amber-200">
                {s}
              </code>
            ))}
            <div className="mt-0.5 text-amber-200/80">Di lab, skrip diblokir. Di situs nyata, skrip seperti ini bisa mencuri cookie sesi pengunjung.</div>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 bg-white">
        {source ? (
          <pre className="h-full overflow-auto bg-[#050810] p-3 font-mono text-[11px] whitespace-pre-wrap text-slate-300">{page.html}</pre>
        ) : (
          <iframe title={page.url} srcDoc={srcDoc} sandbox="" className="h-full w-full border-0" />
        )}
      </div>
    </div>
  );
}
