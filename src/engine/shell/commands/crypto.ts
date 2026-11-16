import { base64Decode, base64Encode, detectHashFormat, hashWith, md5, sha256, type HashFormat } from "../../crypto/hash";
import { ansi, hasFlag, positional, type CommandContext, type CommandDef } from "../types";

function readFile(ctx: CommandContext, path: string): string | null {
  const fs = ctx.device.fs;
  const abs = fs?.resolve(path, ctx.session.cwd);
  const node = abs ? fs!.get(abs) : null;
  if (!node || node.type !== "file") {
    ctx.error(`${ctx.name}: ${path}: Tidak ada file atau direktori tersebut`);
    return null;
  }
  const readable = ctx.isRoot() || node.mode & (node.owner === ctx.user ? 0o400 : 0o004);
  if (!readable) {
    ctx.error(`${ctx.name}: ${path}: Izin ditolak (Permission denied)`);
    return null;
  }
  return node.content;
}

function hashCommand(name: string, fn: (s: string) => string, summary: string): CommandDef {
  return {
    name,
    category: "keamanan",
    summary,
    usage: `${name} <file>...  |  echo -n teks | ${name}`,
    run(ctx) {
      const files = positional(ctx.args);
      if (!files.length) {
        const digest = fn(ctx.stdin ?? "");
        ctx.print(`${digest}  -`);
        ctx.fact(`${name}:stdin`);
        ctx.fact(`${name}:stdin:${digest}`);
        return 0;
      }
      let code = 0;
      for (const f of files) {
        const content = readFile(ctx, f);
        if (content === null) {
          code = 1;
          continue;
        }
        ctx.print(`${fn(content)}  ${f}`);
        ctx.fact(`${name}:${ctx.device.fs!.resolve(f, ctx.session.cwd)}`);
      }
      return code;
    },
  };
}

const base64: CommandDef = {
  name: "base64",
  category: "keamanan",
  summary: "Encode/decode Base64 (encoding, BUKAN enkripsi!)",
  usage: "echo -n teks | base64   |   echo aGFsbw== | base64 -d",
  run(ctx) {
    const decode = hasFlag(ctx.args, "-d", "--decode");
    const file = positional(ctx.args)[0];
    const input = file ? readFile(ctx, file) : (ctx.stdin ?? "");
    if (input === null) return 1;
    if (decode) {
      const out = base64Decode(input.trim());
      if (out === null) {
        ctx.error("base64: invalid input");
        return 1;
      }
      ctx.print(out.replace(/\n$/, ""));
      ctx.fact("base64:decoded");
      return 0;
    }
    ctx.print(base64Encode(input));
    ctx.fact("base64:encoded");
    return 0;
  },
};

const JOHN_POT = "/root/.john/john.pot";

function john(ctx: CommandContext): number {
  const fs = ctx.device.fs;
  if (!fs) return 1;
  const arg = (prefix: string) => ctx.args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  const potPath = fs.resolve("~/.john/john.pot", ctx.session.cwd);
  const pot = new Map<string, string>();
  const potNode = fs.get(potPath) ?? fs.get(JOHN_POT);
  if (potNode?.type === "file") {
    for (const line of potNode.content.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) pot.set(line.slice(0, idx), line.slice(idx + 1));
    }
  }
  const hashFile = positional(ctx.args)[0];
  if (!hashFile) {
    ctx.print("John the Ripper (versi simulasi NetSec Lab)");
    ctx.print("Penggunaan: john --format=raw-md5 --wordlist=<file> <file-hash>");
    ctx.print("            john --show --format=raw-md5 <file-hash>");
    return 0;
  }
  const content = readFile(ctx, hashFile);
  if (content === null) return 1;
  const entries = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf(":");
      return idx > 0 ? { user: l.slice(0, idx), hash: l.slice(idx + 1).toLowerCase() } : { user: "?", hash: l.toLowerCase() };
    });
  const format = (arg("--format=") as HashFormat | undefined) ?? detectHashFormat(entries[0]?.hash ?? "");
  if (format !== "raw-md5" && format !== "raw-sha256") {
    ctx.error("No password hashes loaded (format tidak dikenali; coba --format=raw-md5 atau --format=raw-sha256)");
    return 1;
  }

  if (ctx.args.includes("--show")) {
    let cracked = 0;
    for (const e of entries) {
      const plain = pot.get(e.hash);
      if (plain !== undefined) {
        ctx.print(`${e.user}:${plain}`);
        cracked++;
      }
    }
    ctx.print("");
    ctx.print(`${cracked} password hash${cracked === 1 ? "" : "es"} cracked, ${entries.length - cracked} left`);
    ctx.fact("john:show");
    return 0;
  }

  const wordlistPath = arg("--wordlist=");
  if (!wordlistPath) {
    ctx.error("john: di lab ini gunakan mode wordlist: --wordlist=<file>");
    return 1;
  }
  const wordlist = readFile(ctx, wordlistPath);
  if (wordlist === null) return 1;
  const words = wordlist.split("\n").map((w) => w.trim()).filter(Boolean);

  ctx.print(`Using default input encoding: UTF-8`);
  ctx.print(`Loaded ${entries.length} password hash${entries.length === 1 ? "" : "es"} (${format === "raw-md5" ? "Raw-MD5 [MD5 128/128 AVX 4x3]" : "Raw-SHA256 [SHA256 128/128 AVX 4x]"})`);
  ctx.print(`Press 'q' or Ctrl-C to abort, almost any other key for status`);
  const found: string[] = [];
  let tried = 0;
  for (const e of entries) {
    if (pot.has(e.hash)) continue;
    for (const w of words) {
      tried++;
      if (hashWith(format, w) === e.hash) {
        pot.set(e.hash, w);
        found.push(`${w.padEnd(18)} (${e.user})`);
        ctx.fact(`john:cracked:${e.user}`);
        break;
      }
    }
  }
  ctx.t += 400 + tried * 4;
  for (const f of found) ctx.print(ansi.green(f));
  const left = entries.filter((e) => !pot.has(e.hash)).length;
  ctx.print(`${found.length}g 0:00:00:0${Math.min(9, 1 + Math.floor(tried / 500))} DONE (2026-11-16 10:00) ${tried} kata dicoba`);
  if (left) ctx.print(ansi.yellow(`${left} hash tidak ditemukan di wordlist — password yang panjang & unik tidak ada di daftar mana pun.`));
  ctx.print(`Use the "--show" option to display all of the cracked passwords reliably`);
  fs.mkdirp(potPath.slice(0, potPath.lastIndexOf("/")));
  fs.writeFile(potPath, [...pot.entries()].map(([h, p]) => `${h}:${p}`).join("\n") + "\n");
  ctx.fact("john:run");
  return 0;
}

export const cryptoCommands: CommandDef[] = [
  hashCommand("md5sum", md5, "Menghitung hash MD5 (128 bit) — sudah tidak aman untuk password"),
  hashCommand("sha256sum", sha256, "Menghitung hash SHA-256 (256 bit) untuk cek integritas file"),
  base64,
  {
    name: "john",
    category: "keamanan",
    summary: "Menguji kekuatan hash password dengan wordlist (dictionary attack)",
    usage: "john --format=raw-md5 --wordlist=<file> <file-hash>  |  john --show <file-hash>",
    run: john,
  },
];
