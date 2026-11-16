import { sha256 } from "../../crypto/hash";
import { ansi, type CommandDef } from "../types";

export const submitFlagCommand: CommandDef = {
  name: "submit-flag",
  category: "dasar",
  summary: "Mengirim FLAG yang kamu temukan di tantangan CTF",
  usage: "submit-flag FLAG{...}",
  run(ctx) {
    const flags = ctx.flags ?? [];
    if (!flags.length) {
      ctx.error("submit-flag: lab ini bukan tantangan CTF.");
      return 1;
    }
    const value = ctx.args.join(" ").trim();
    if (!value) {
      ctx.print("Penggunaan: submit-flag FLAG{...}");
      return 1;
    }
    const match = flags.find((f) => f.hash === sha256(value));
    if (!match) {
      ctx.print(ansi.red("✗ Flag salah. Periksa lagi huruf besar/kecil dan pastikan formatnya FLAG{...}"));
      ctx.fact("flag:wrong");
      return 1;
    }
    ctx.print(ansi.green(`✓ Benar! Tantangan "${match.title}" selesai (+${match.points} poin)`));
    ctx.fact(`flag:${match.id}`);
    return 0;
  },
};
