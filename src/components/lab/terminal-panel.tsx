"use client";

import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { TerminalSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { ansi, complete, prompt } from "@/engine";
import type { TerminalIO } from "@/store/lab-store";
import { useLab, useLabStore } from "./lab-context";

const theme = {
  background: "#050810",
  foreground: "#e2e8f0",
  cursor: "#34d399",
  cursorAccent: "#050810",
  selectionBackground: "#1f2a40",
  black: "#1e293b",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#e879f9",
  cyan: "#22d3ee",
  white: "#e2e8f0",
  brightBlack: "#64748b",
  brightRed: "#fca5a5",
  brightGreen: "#6ee7b7",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#f0abfc",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

function commonPrefix(items: string[]) {
  if (!items.length) return "";
  let prefix = items[0];
  for (const item of items) while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

export function TerminalPanel() {
  const store = useLabStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<(() => void) | null>(null);
  const resetCount = useLab((s) => s.resetCount);
  const activeDevice = useLab((s) => s.activeDevice);
  const running = useLab((s) => s.running);
  const controllable = useLab((s) => s.lab.controllable);
  const net = useLab((s) => s.net);
  const setActiveDevice = useLab((s) => s.setActiveDevice);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const monoFont = getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim();
    const term = new Terminal({
      theme,
      fontFamily: `${monoFont ? `${monoFont}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`,
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      convertEol: true,
      scrollback: 2000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    const doFit = () => {
      try {
        fit.fit();
      } catch {
        /* container not measurable yet */
      }
    };
    doFit();
    const resizeObserver = new ResizeObserver(doFit);
    resizeObserver.observe(container);

    let disposed = false;
    let buffer = "";
    let cursor = 0;
    let historyIndex: number | null = null;
    let draft = "";

    const session = () => store.getState().session();
    const promptText = () => prompt(session());
    const redraw = () => {
      const pending = store.getState().pending;
      if (pending) {
        term.write(`\r\x1b[K${pending.prompt}${pending.secret ? "" : buffer}`);
        return;
      }
      term.write(`\r\x1b[K${promptText()}${buffer}`);
      const back = buffer.length - cursor;
      if (back > 0) term.write(`\x1b[${back}D`);
    };
    const pendingPrompt = () => store.getState().pending;
    const newPrompt = () => {
      buffer = "";
      cursor = 0;
      historyIndex = null;
      const pending = pendingPrompt();
      term.write(pending ? pending.prompt : promptText());
    };

    const io: TerminalIO = {
      write: (text) => {
        if (!disposed) term.write(`${text}\n`);
      },
      clear: () => {
        if (!disposed) term.clear();
      },
      done: () => {
        if (!disposed) newPrompt();
      },
    };

    const lab = store.getState().lab;
    term.writeln(ansi.boldGreen(`┌─ NetSec Lab: ${lab.title}`));
    term.writeln(ansi.dim("│  Semua perangkat di sini adalah simulasi. Bebas bereksperimen!"));
    term.writeln(ansi.dim("└─ Ketik 'help' untuk daftar perintah.\n"));
    newPrompt();
    term.focus();

    switchRef.current = () => {
      if (disposed) return;
      term.write(`\r\x1b[K${ansi.dim(`── beralih ke ${session().device.name} ──`)}\n`);
      newPrompt();
      term.focus();
    };

    const submit = () => {
      term.write("\r\n");
      const line = buffer;
      if (pendingPrompt()) {
        buffer = "";
        cursor = 0;
        store.getState().answer(line, io);
        return;
      }
      if (!line.trim()) {
        newPrompt();
        return;
      }
      buffer = "";
      cursor = 0;
      store.getState().run(line, io);
    };

    const tabComplete = () => {
      const before = buffer.slice(0, cursor);
      const candidates = complete(session(), before);
      if (!candidates.length) return;
      const words = before.split(" ");
      const current = words[words.length - 1];
      const prefix = commonPrefix(candidates);
      const addition = (candidates.length === 1 ? candidates[0] + (candidates[0].endsWith("/") ? "" : " ") : prefix).slice(current.length);
      if (addition) {
        buffer = buffer.slice(0, cursor) + addition + buffer.slice(cursor);
        cursor += addition.length;
        redraw();
      } else if (candidates.length > 1) {
        term.write(`\r\n${candidates.join("  ")}\r\n`);
        redraw();
      }
    };

    const browseHistory = (direction: -1 | 1) => {
      const history = session().history;
      if (!history.length) return;
      if (historyIndex === null) {
        if (direction === 1) return;
        draft = buffer;
        historyIndex = history.length - 1;
      } else {
        historyIndex += direction;
      }
      if (historyIndex >= history.length) {
        historyIndex = null;
        buffer = draft;
      } else {
        historyIndex = Math.max(0, historyIndex);
        buffer = history[historyIndex];
      }
      cursor = buffer.length;
      redraw();
    };

    const handleKey = (data: string) => {
      if (store.getState().running) {
        if (data === "\x03") store.getState().cancel(io);
        return;
      }
      switch (data) {
        case "\r":
          return submit();
        case "\x7f":
        case "\b":
          if (cursor > 0) {
            buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
            cursor--;
            redraw();
          }
          return;
        case "\x1b[3~":
          if (cursor < buffer.length) {
            buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
            redraw();
          }
          return;
        case "\x1b[A":
          return pendingPrompt() ? undefined : browseHistory(-1);
        case "\x1b[B":
          return pendingPrompt() ? undefined : browseHistory(1);
        case "\x1b[C":
          if (cursor < buffer.length) {
            cursor++;
            term.write(data);
          }
          return;
        case "\x1b[D":
          if (cursor > 0) {
            cursor--;
            term.write(data);
          }
          return;
        case "\x1b[H":
        case "\x1b[1~":
        case "\x01":
          cursor = 0;
          return redraw();
        case "\x1b[F":
        case "\x1b[4~":
        case "\x05":
          cursor = buffer.length;
          return redraw();
        case "\t":
          return pendingPrompt() ? undefined : tabComplete();
        case "\x03":
          if (pendingPrompt()) return store.getState().cancel(io);
          term.write("^C\r\n");
          return newPrompt();
        case "\x0c":
          term.clear();
          return redraw();
        case "\x15":
          buffer = buffer.slice(cursor);
          cursor = 0;
          return redraw();
      }
      if (data.startsWith("\x1b")) return;
      for (const ch of data) {
        if (store.getState().running) return;
        if (ch === "\r" || ch === "\n") submit();
        else if (ch >= " ") {
          buffer = buffer.slice(0, cursor) + ch + buffer.slice(cursor);
          cursor++;
          if (pendingPrompt()?.secret) continue;
          if (cursor === buffer.length) term.write(ch);
          else redraw();
        }
      }
    };
    const sub = term.onData(handleKey);

    return () => {
      disposed = true;
      switchRef.current = null;
      sub.dispose();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [store, resetCount]);

  const shownDevice = useRef(activeDevice);
  useEffect(() => {
    if (shownDevice.current === activeDevice) return;
    shownDevice.current = activeDevice;
    switchRef.current?.();
  }, [activeDevice]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-[#050810]">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          <TerminalSquare className="size-4 text-accent" />
          <span className="font-medium text-slate-200">Terminal</span>
          {running && <span className="animate-pulse text-amber-300">● berjalan… (Ctrl+C untuk batal)</span>}
        </div>
        {controllable.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            Perangkat:
            <select
              value={activeDevice}
              disabled={running}
              onChange={(e) => setActiveDevice(e.target.value)}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-slate-100"
            >
              {controllable.map((id) => (
                <option key={id} value={id}>
                  {net.device(id).name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-xs text-muted">{net.device(activeDevice).name}</span>
        )}
      </div>
      <div className="min-h-0 flex-1 p-2" onClick={() => containerRef.current?.querySelector("textarea")?.focus()}>
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
