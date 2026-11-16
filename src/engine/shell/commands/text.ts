import { canRead, FsError } from "../fs";
import { hasFlag, positional, type CommandContext, type CommandDef } from "../types";

function readInput(ctx: CommandContext, file: string | undefined): string | null {
  if (!file) return ctx.stdin ?? "";
  const fs = ctx.device.fs;
  const abs = fs?.resolve(file, ctx.session.cwd);
  const node = abs ? fs!.get(abs) : null;
  if (!node || node.type !== "file") {
    ctx.error(`${ctx.name}: ${file}: Tidak ada file atau direktori tersebut`);
    return null;
  }
  if (!canRead(node, ctx.user, ctx.isRoot())) {
    ctx.error(`${ctx.name}: ${file}: Izin ditolak (Permission denied)`);
    ctx.fact(`denied:${abs}`);
    return null;
  }
  ctx.fact(`read:${abs}`);
  return node.content;
}

function lines(text: string) {
  const ls = text.split("\n");
  if (ls[ls.length - 1] === "") ls.pop();
  return ls;
}

function countArg(ctx: CommandContext, fallback = 10) {
  const idx = ctx.args.indexOf("-n");
  if (idx >= 0) return Number(ctx.args[idx + 1]) || fallback;
  const short = ctx.args.find((a) => /^-\d+$/.test(a));
  return short ? Number(short.slice(1)) : fallback;
}

function nonCountArgs(ctx: CommandContext) {
  const idx = ctx.args.indexOf("-n");
  return positional(ctx.args.filter((_, i) => idx < 0 || (i !== idx + 1 && i !== idx)));
}

export const textCommands: CommandDef[] = [
  {
    name: "echo",
    category: "teks",
    summary: "Mencetak teks ke layar (atau ke file dengan > )",
    usage: "echo <teks>",
    run(ctx) {
      const noNewline = ctx.args[0] === "-n";
      const text = (noNewline ? ctx.args.slice(1) : ctx.args).join(" ");
      if (noNewline) ctx.write(text);
      else ctx.print(text);
      ctx.fact("cmd:echo");
    },
  },
  {
    name: "grep",
    category: "teks",
    summary: "Mencari baris yang mengandung pola tertentu",
    usage: "grep [-i] [-v] <pola> [file]",
    run(ctx) {
      const [pattern, file] = positional(ctx.args);
      if (!pattern) {
        ctx.error("Penggunaan: grep [-i] [-v] <pola> [file]");
        return 2;
      }
      const input = readInput(ctx, file);
      if (input === null) return 2;
      const ignoreCase = hasFlag(ctx.args, "-i");
      const invert = hasFlag(ctx.args, "-v");
      const needle = ignoreCase ? pattern.toLowerCase() : pattern;
      const matches = lines(input).filter((l) => (ignoreCase ? l.toLowerCase() : l).includes(needle) !== invert);
      ctx.fact("cmd:grep");
      for (const m of matches) ctx.print(m);
      return matches.length ? 0 : 1;
    },
  },
  {
    name: "head",
    category: "teks",
    summary: "Menampilkan beberapa baris pertama",
    usage: "head [-n N] [file]",
    run(ctx) {
      const input = readInput(ctx, nonCountArgs(ctx)[0]);
      if (input === null) return 1;
      for (const l of lines(input).slice(0, countArg(ctx))) ctx.print(l);
    },
  },
  {
    name: "tail",
    category: "teks",
    summary: "Menampilkan beberapa baris terakhir",
    usage: "tail [-n N] [file]",
    run(ctx) {
      const input = readInput(ctx, nonCountArgs(ctx)[0]);
      if (input === null) return 1;
      for (const l of lines(input).slice(-countArg(ctx))) ctx.print(l);
    },
  },
  {
    name: "wc",
    category: "teks",
    summary: "Menghitung baris, kata, dan karakter",
    usage: "wc [-l] [file]",
    run(ctx) {
      try {
        const file = positional(ctx.args)[0];
        const input = readInput(ctx, file);
        if (input === null) return 1;
        const l = lines(input).length;
        if (hasFlag(ctx.args, "-l")) ctx.print(`${l}${file ? ` ${file}` : ""}`);
        else ctx.print(`${l} ${input.split(/\s+/).filter(Boolean).length} ${input.length}${file ? ` ${file}` : ""}`);
      } catch (err) {
        if (err instanceof FsError) return 1;
        throw err;
      }
    },
  },
];
