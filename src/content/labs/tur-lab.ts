import type { LabDefinition } from "@/engine";
import { has, hasMatch } from "./helpers";

export const turLab: LabDefinition = {
  id: "tur-lab",
  title: "Tur Lab Interaktif",
  summary: "Kenalan dengan terminal, peta jaringan, dan inspektor paket. Kirim paket pertamamu!",
  difficulty: "pemula",
  estimatedMinutes: 10,
  xp: 50,
  controllable: ["laptop"],
  briefing: [
    "Selamat datang di lab pertamamu! Di sebelah kiri ada terminal: tempat kamu mengetik perintah ke laptop virtualmu. Di sebelah kanan ada peta jaringan yang menampilkan apa yang sebenarnya terjadi di kabel jaringan.",
    "Semua yang ada di sini adalah simulasi — kamu tidak bisa merusak apa pun. Bereksperimenlah sebebasnya!",
  ],
  topology: {
    devices: [
      { id: "laptop", name: "Laptop Kamu", hostname: "laptop", kind: "laptop", position: { x: 0, y: 160 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], hosts: { teman: "192.168.1.20", printer: "192.168.1.50" } },
      { id: "sw1", name: "Switch", kind: "switch", position: { x: 260, y: 160 } },
      { id: "teman", name: "PC Teman", hostname: "pc-teman", kind: "pc", position: { x: 520, y: 40 }, interfaces: [{ name: "eth0", ip: "192.168.1.20/24" }] },
      { id: "printer", name: "Printer", hostname: "printer", kind: "server", position: { x: 520, y: 280 }, interfaces: [{ name: "eth0", ip: "192.168.1.50/24" }] },
    ],
    links: [
      ["laptop:eth0", "sw1:p1"],
      ["teman:eth0", "sw1:p2"],
      ["printer:eth0", "sw1:p3"],
    ],
  },
  objectives: [
    { id: "help", text: "Ketik `help` untuk melihat daftar perintah", check: has("cmd:help") },
    { id: "whoami", text: "Cari tahu siapa kamu dengan `whoami`", check: has("cmd:whoami") },
    { id: "ip", text: "Lihat alamat IP laptopmu dengan `ip a`", check: has("ip:viewed") },
    { id: "ping", text: "Kirim ping ke PC teman: `ping 192.168.1.20` (atau `ping teman`)", check: has("ping:ok:192.168.1.20") },
    { id: "inspect", text: "Klik salah satu paket di panel *Paket* untuk melihat isinya", check: has("ui:packet-inspected") },
    { id: "printer", text: "Bonus: ping printer, lalu lihat tabel ARP dengan `arp -a`", check: (ctx) => ctx.facts.has("ping:ok:192.168.1.50") && hasMatch(/^arp:viewed$/)(ctx) },
  ],
  hints: [
    "Ketik perintah lalu tekan Enter. Contoh: ketik help lalu Enter.",
    "Perhatikan animasi di peta: paket kuning (ARP) muncul lebih dulu sebelum paket biru (ICMP). Kenapa? Laptopmu harus tahu dulu alamat MAC teman!",
    "Gunakan slider kecepatan di atas peta untuk memperlambat animasi.",
  ],
};
