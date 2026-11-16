import { canEnter, canRead, FsError, formatMode, type FsNode } from "../fs";
import { ansi, hasFlag, positional, type CommandContext, type CommandDef } from "../types";

function fsOf(ctx: CommandContext) {
  const fs = ctx.device.fs;
  if (!fs) throw new FsError("sistem file tidak tersedia di perangkat ini");
  return fs;
}

function guard(ctx: CommandContext, fn: () => number | void): number {
  try {
    return fn() ?? 0;
  } catch (err) {
    if (err instanceof FsError) {
      ctx.error(`${ctx.name}: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

function canWrite(ctx: CommandContext, node: FsNode | null) {
  return ctx.isRoot() || !node || node.owner === ctx.user;
}

function assertWritable(ctx: CommandContext, abs: string) {
  if (!fsOf(ctx).canWrite(abs, ctx.user, ctx.isRoot())) {
    throw new FsError(`'${abs}': Izin ditolak (Permission denied)`);
  }
}

function colorName(name: string, node: FsNode) {
  if (node.type === "dir") return ansi.boldBlue(name);
  if (node.mode & 0o111) return ansi.boldGreen(name);
  return name;
}

export const fileCommands: CommandDef[] = [
  {
    name: "pwd",
    category: "file",
    summary: "Menampilkan direktori kerja saat ini (print working directory)",
    usage: "pwd",
    run(ctx) {
      ctx.print(ctx.session.cwd);
      ctx.fact("cmd:pwd");
    },
  },
  {
    name: "ls",
    category: "file",
    summary: "Menampilkan isi direktori",
    usage: "ls [-l] [-a] [direktori]",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const long = hasFlag(ctx.args, "-l");
        const all = hasFlag(ctx.args, "-a");
        const target = fs.resolve(positional(ctx.args)[0] ?? ".", ctx.session.cwd);
        const node = fs.get(target);
        if (!node) {
          ctx.error(`ls: tidak dapat mengakses '${positional(ctx.args)[0]}': Tidak ada file atau direktori tersebut`);
          return 2;
        }
        if (node.type === "dir" && !canRead(node, ctx.user, ctx.isRoot())) {
          ctx.error(`ls: tidak dapat membuka direktori '${positional(ctx.args)[0] ?? "."}': Izin ditolak (Permission denied)`);
          ctx.fact(`denied:${target}`);
          return 2;
        }
        ctx.fact("cmd:ls");
        if (all) ctx.fact("ls:all");
        if (long) ctx.fact("ls:long");
        const entries: [string, FsNode][] =
          node.type === "dir" ? [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b)) : [[target.split("/").pop()!, node]];
        const visible = entries.filter(([name]) => all || !name.startsWith("."));
        if (long) {
          ctx.print(`total ${visible.length * 4}`);
          for (const [name, n] of visible) {
            const size = n.type === "file" ? n.content.length : 4096;
            ctx.print(`${formatMode(n)} 1 ${n.owner.padEnd(6)} ${n.owner.padEnd(6)} ${String(size).padStart(5)} Nov 15 10:00 ${colorName(name, n)}`);
          }
        } else if (visible.length) {
          ctx.print(visible.map(([name, n]) => colorName(name, n)).join("  "));
        }
      });
    },
  },
  {
    name: "cd",
    category: "file",
    summary: "Pindah direktori (change directory)",
    usage: "cd [direktori]",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const arg = ctx.args[0] ?? "~";
        const target = fs.resolve(arg, ctx.session.cwd);
        const node = fs.get(target);
        if (!node) {
          ctx.error(`cd: ${arg}: Tidak ada file atau direktori tersebut`);
          return 1;
        }
        if (node.type !== "dir") {
          ctx.error(`cd: ${arg}: Bukan direktori`);
          return 1;
        }
        if (!canEnter(node, ctx.user, ctx.isRoot())) {
          ctx.error(`cd: ${arg}: Izin ditolak (Permission denied)`);
          ctx.fact(`denied:${target}`);
          return 1;
        }
        ctx.session.cwd = target;
        ctx.fact(`cd:${target}`);
      });
    },
  },
  {
    name: "cat",
    category: "file",
    summary: "Menampilkan isi file",
    usage: "cat <file>...",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const files = positional(ctx.args);
        if (!files.length) {
          if (ctx.stdin !== null) ctx.print(ctx.stdin.replace(/\n$/, ""));
          return;
        }
        let code = 0;
        for (const f of files) {
          const abs = fs.resolve(f, ctx.session.cwd);
          const node = fs.get(abs);
          if (!node) {
            ctx.error(`cat: ${f}: Tidak ada file atau direktori tersebut`);
            code = 1;
          } else if (node.type === "dir") {
            ctx.error(`cat: ${f}: Adalah sebuah direktori`);
            code = 1;
          } else if (!canRead(node, ctx.user, ctx.isRoot())) {
            ctx.error(`cat: ${f}: Izin ditolak (Permission denied)`);
            ctx.fact(`denied:${abs}`);
            code = 1;
          } else {
            ctx.fact(`cat:${abs}`);
            if (node.content) ctx.print(node.content.replace(/\n$/, ""));
          }
        }
        return code;
      });
    },
  },
  {
    name: "mkdir",
    category: "file",
    summary: "Membuat direktori baru",
    usage: "mkdir [-p] <direktori>",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const names = positional(ctx.args);
        if (!names.length) {
          ctx.error("mkdir: operand tidak ada");
          return 1;
        }
        for (const name of names) {
          const abs = fs.resolve(name, ctx.session.cwd);
          assertWritable(ctx, abs);
          if (hasFlag(ctx.args, "-p")) fs.mkdirp(abs);
          else fs.mkdir(abs);
          ctx.fact(`mkdir:${abs}`);
        }
      });
    },
  },
  {
    name: "touch",
    category: "file",
    summary: "Membuat file kosong",
    usage: "touch <file>",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        for (const name of positional(ctx.args)) {
          const abs = fs.resolve(name, ctx.session.cwd);
          assertWritable(ctx, abs);
          if (!fs.get(abs)) fs.writeFile(abs, "");
          ctx.fact(`touch:${abs}`);
        }
      });
    },
  },
  {
    name: "rm",
    category: "file",
    summary: "Menghapus file atau direktori (hati-hati, tidak ada recycle bin!)",
    usage: "rm [-r] <file>",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const recursive = hasFlag(ctx.args, "-r", "-R");
        for (const name of positional(ctx.args)) {
          const abs = fs.resolve(name, ctx.session.cwd);
          if (abs === "/") {
            ctx.error("rm: sangat berbahaya untuk menghapus '/' secara rekursif — ditolak demi keamananmu 🙂");
            return 1;
          }
          const node = fs.get(abs);
          if (node && !canWrite(ctx, node)) {
            ctx.error(`rm: tidak dapat menghapus '${name}': Izin ditolak`);
            return 1;
          }
          fs.remove(abs, recursive);
          ctx.fact(`rm:${abs}`);
        }
      });
    },
  },
  {
    name: "mv",
    category: "file",
    summary: "Memindahkan atau mengganti nama file",
    usage: "mv <asal> <tujuan>",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const [from, to] = positional(ctx.args);
        if (!from || !to) {
          ctx.error("mv: operand tidak lengkap");
          return 1;
        }
        const fromAbs = fs.resolve(from, ctx.session.cwd);
        const toAbs = fs.resolve(to, ctx.session.cwd);
        assertWritable(ctx, fromAbs);
        assertWritable(ctx, fs.get(toAbs)?.type === "dir" ? `${toAbs}/${fromAbs.split("/").pop()}` : toAbs);
        fs.move(fromAbs, toAbs);
        ctx.fact("cmd:mv");
      });
    },
  },
  {
    name: "cp",
    category: "file",
    summary: "Menyalin file",
    usage: "cp <asal> <tujuan>",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const [from, to] = positional(ctx.args);
        if (!from || !to) {
          ctx.error("cp: operand tidak lengkap");
          return 1;
        }
        const toAbs = fs.resolve(to, ctx.session.cwd);
        const fromAbs = fs.resolve(from, ctx.session.cwd);
        const source = fs.get(fromAbs);
        if (source && !canRead(source, ctx.user, ctx.isRoot())) {
          ctx.fact(`denied:${fromAbs}`);
          throw new FsError(`tidak dapat membuka '${from}' untuk dibaca: Izin ditolak (Permission denied)`);
        }
        assertWritable(ctx, fs.get(toAbs)?.type === "dir" ? `${toAbs}/${from.split("/").pop()}` : toAbs);
        fs.copy(fromAbs, toAbs);
        ctx.fact("cmd:cp");
      });
    },
  },
  {
    name: "chmod",
    category: "file",
    summary: "Mengubah izin akses file (contoh: chmod 755 script.sh)",
    usage: "chmod <mode-oktal> <file>",
    run(ctx) {
      return guard(ctx, () => {
        const fs = fsOf(ctx);
        const [mode, name] = ctx.args;
        if (!mode || !name || !/^[0-7]{3}$/.test(mode)) {
          ctx.error("chmod: gunakan mode oktal 3 digit, contoh: chmod 644 catatan.txt");
          return 1;
        }
        const abs = fs.resolve(name, ctx.session.cwd);
        const node = fs.get(abs);
        if (!node) {
          ctx.error(`chmod: tidak dapat mengakses '${name}': Tidak ada file atau direktori tersebut`);
          return 1;
        }
        if (!canWrite(ctx, node)) {
          ctx.error(`chmod: mengubah izin '${name}': Operation not permitted`);
          return 1;
        }
        node.mode = parseInt(mode, 8);
        ctx.fact(`chmod:${abs}:${mode}`);
      });
    },
  },
];
