import { ansi, type CommandContext, type CommandDef } from "../types";

export function basicCommands(registry: () => Map<string, CommandDef>): CommandDef[] {
  return [
    {
      name: "help",
      category: "dasar",
      summary: "Menampilkan daftar perintah yang tersedia",
      usage: "help",
      run(ctx) {
        const categories: Record<CommandDef["category"], string> = {
          dasar: "Dasar",
          file: "File & Direktori",
          teks: "Teks",
          jaringan: "Jaringan",
          keamanan: "Keamanan (gunakan hanya di lab!)",
          switch: "Switch (hanya di perangkat switch)",
        };
        const unique = [...new Set(registry().values())]
          .filter((c) => (c.category === "switch") === (ctx.device.kind === "switch") || c.category === "dasar")
          .filter((c) => !ctx.allowed || ctx.allowed.includes(c.name) || c.name === "help" || c.name === "clear");
        ctx.print(ansi.bold("Perintah yang tersedia di lab ini:"));
        for (const [cat, label] of Object.entries(categories)) {
          const cmds = unique.filter((c) => c.category === cat);
          if (!cmds.length) continue;
          ctx.print("");
          ctx.print(ansi.yellow(label));
          for (const c of cmds) ctx.print(`  ${ansi.green(c.name.padEnd(12))} ${c.summary}`);
        }
        ctx.print("");
        ctx.print(ansi.dim("Tips: 'man <perintah>' untuk detail, ↑/↓ untuk riwayat, Tab untuk melengkapi, Ctrl+C untuk membatalkan."));
        ctx.fact("cmd:help");
      },
    },
    {
      name: "man",
      category: "dasar",
      summary: "Menampilkan manual singkat sebuah perintah",
      usage: "man <perintah>",
      run(ctx) {
        const cmd = registry().get(ctx.args[0] ?? "");
        if (!cmd) {
          ctx.error(ctx.args[0] ? `Tidak ada manual untuk ${ctx.args[0]}` : "Perintah apa yang ingin kamu baca manualnya? Contoh: man ls");
          return 1;
        }
        ctx.print(ansi.bold(cmd.name.toUpperCase()));
        ctx.print(`  ${cmd.summary}`);
        ctx.print("");
        ctx.print(ansi.bold("PENGGUNAAN"));
        ctx.print(`  ${cmd.usage}`);
        ctx.fact(`man:${cmd.name}`);
      },
    },
    {
      name: "clear",
      category: "dasar",
      summary: "Membersihkan layar terminal (di switch: clear mac address-table)",
      usage: "clear",
      run(ctx) {
        if (ctx.args[0] === "mac" && ctx.device.kind === "switch") {
          ctx.device.macTable.clear();
          ctx.print("Tabel MAC dikosongkan.");
          ctx.fact(`switch:clear-mac:${ctx.device.id}`);
          return 0;
        }
        ctx.clear();
      },
    },
    {
      name: "whoami",
      category: "dasar",
      summary: "Menampilkan nama user yang sedang login",
      usage: "whoami",
      run(ctx) {
        ctx.print(ctx.sudo ? "root" : ctx.user);
        ctx.fact("cmd:whoami");
      },
    },
    {
      name: "hostname",
      category: "dasar",
      summary: "Menampilkan nama komputer ini",
      usage: "hostname",
      run(ctx) {
        ctx.print(ctx.device.hostname);
        ctx.fact("cmd:hostname");
      },
    },
    {
      name: "uname",
      category: "dasar",
      summary: "Menampilkan informasi sistem operasi",
      usage: "uname [-a]",
      run(ctx) {
        ctx.print(ctx.args.includes("-a") ? `Linux ${ctx.device.hostname} 6.8.0-netsec #1 SMP x86_64 GNU/Linux` : "Linux");
        ctx.fact("cmd:uname");
      },
    },
    {
      name: "date",
      category: "dasar",
      summary: "Menampilkan tanggal & waktu",
      usage: "date",
      run(ctx) {
        ctx.print(new Date().toString());
      },
    },
    {
      name: "history",
      category: "dasar",
      summary: "Menampilkan riwayat perintah",
      usage: "history",
      run(ctx: CommandContext) {
        ctx.session.history.forEach((h, i) => ctx.print(`${String(i + 1).padStart(5)}  ${h}`));
      },
    },
  ];
}
