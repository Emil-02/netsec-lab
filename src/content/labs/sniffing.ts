import type { LabDefinition } from "@/engine";
import { fileAt, has, NET_COMMANDS, recent } from "./helpers";

const LOGIN_HTTP = 'curl -s -d "user=budi&pass=Budi2026!" http://intranet.lab/login';
const LOGIN_HTTPS = 'curl -s -d "user=budi&pass=Budi2026!" https://bank.lab/login';

const loginPage = () => ({ body: "Login berhasil.\n" });

export const sniffingLab: LabDefinition = {
  id: "sniffing",
  title: "Menyadap Lalu Lintas di Jaringan Hub",
  summary: "Pasang tcpdump di jaringan lama yang masih memakai hub dan buktikan betapa berbahayanya protokol tanpa enkripsi.",
  difficulty: "menengah",
  estimatedMinutes: 18,
  xp: 150,
  controllable: ["auditor"],
  allowedCommands: [...NET_COMMANDS, "tcpdump", "curl"],
  background: [
    { device: "budi", command: LOGIN_HTTP },
    { device: "budi", command: LOGIN_HTTPS },
  ],
  briefing: [
    "Kamu adalah auditor keamanan yang diminta memeriksa jaringan lantai 3. Jaringan ini masih memakai **hub** lama, dan intranet perusahaan masih memakai **HTTP**.",
    "Setiap kali kamu menjalankan `tcpdump`, Budi (PC sebelah) sedang login ke intranet (HTTP) dan ke internet banking (HTTPS). Buktikan risikonya agar manajemen mau berinvestasi!",
  ],
  topology: {
    devices: [
      { id: "auditor", name: "Laptop Auditor", hostname: "auditor", kind: "attacker", user: "auditor", position: { x: 0, y: 160 }, interfaces: [{ name: "eth0", ip: "10.3.0.50/24" }] },
      { id: "hub", name: "Hub Lama", kind: "hub", position: { x: 240, y: 160 } },
      {
        id: "budi",
        name: "PC Budi",
        hostname: "pc-budi",
        kind: "pc",
        user: "budi",
        position: { x: 240, y: 360 },
        interfaces: [{ name: "eth0", ip: "10.3.0.21/24" }],
        hosts: { "intranet.lab": "10.3.0.80", "bank.lab": "10.3.0.90" },
      },
      { id: "intranet", name: "Intranet (HTTP)", hostname: "intranet", kind: "server", position: { x: 480, y: 60 }, interfaces: [{ name: "eth0", ip: "10.3.0.80/24" }], web: { routes: { "/login": loginPage } } },
      { id: "bank", name: "bank.lab (HTTPS)", hostname: "bank", kind: "server", position: { x: 480, y: 260 }, interfaces: [{ name: "eth0", ip: "10.3.0.90/24" }], web: { https: true, routes: { "/login": loginPage } } },
    ],
    links: [
      ["auditor:eth0", "hub:p1"],
      ["budi:eth0", "hub:p2"],
      ["intranet:eth0", "hub:p3"],
      ["bank:eth0", "hub:p4"],
    ],
  },
  objectives: [
    { id: "run", text: "Jalankan `sudo tcpdump` dan lihat paket milik orang lain ikut tertangkap", check: (ctx) => ctx.facts.has("tcpdump:run:auditor") && ctx.facts.has("tcpdump:saw-others") },
    { id: "filter", text: "Saring hanya lalu lintas web: `sudo tcpdump tcp port 80`", check: has("tcpdump:filter") },
    { id: "ascii", text: "Tampilkan isi paket dengan `-A` dan temukan username & password Budi", check: has("tcpdump:read-http-password") },
    {
      id: "report",
      text: "Catat temuanmu: tulis username yang bocor ke `~/temuan.txt` (jangan tulis passwordnya!)",
      check: (ctx) => {
        const f = fileAt(ctx, "auditor", "/home/auditor/temuan.txt");
        return f?.type === "file" && f.content.toLowerCase().includes("budi") && !f.content.includes("Budi2026!");
      },
    },
    { id: "https", text: "Di panel Paket, klik paket **TLS Application Data** dari login ke bank.lab. Bisakah password-nya dibaca?", check: has("ui:inspect:tls-data") },
  ],
  hints: [
    "tcpdump butuh hak root karena menempatkan kartu jaringan dalam *promiscuous mode* (menerima semua frame, bukan hanya miliknya).",
    "Contoh: `sudo tcpdump -A tcp port 80` — opsi `-A` menampilkan isi paket sebagai teks.",
    "Laporan audit yang baik membuktikan risiko tanpa menyebarkan rahasia. Cukup tulis username dan jenis kebocorannya.",
  ],
};

export const arpDefenseLab: LabDefinition = {
  id: "deteksi-arp-spoofing",
  title: "Mendeteksi & Menangkal ARP Spoofing",
  summary: "PC-mu sedang menjadi korban man-in-the-middle. Temukan buktinya dan lindungi dirimu dengan entri ARP statis.",
  difficulty: "menengah",
  estimatedMinutes: 18,
  xp: 150,
  controllable: ["pc"],
  allowedCommands: [...NET_COMMANDS, "curl", "tcpdump"],
  briefing: [
    "Akhir-akhir ini koneksi internet di PC-mu terasa sedikit lambat. Admin curiga ada perangkat asing di LAN yang melakukan **ARP spoofing**: mengaku sebagai router agar semua lalu lintasmu melewatinya.",
    "Kamu memegang PC korban. Kumpulkan bukti, lalu kunci alamat MAC router yang asli.",
  ],
  topology: {
    arpPoison: [{ victim: "pc", ip: "192.168.1.1", attacker: "asing" }],
    devices: [
      { id: "pc", name: "PC Kamu", hostname: "pc", kind: "pc", position: { x: 0, y: 120 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], gateway: "192.168.1.1", hosts: { "web.lab": "203.0.113.80" } },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 230, y: 120 } },
      { id: "asing", name: "Perangkat Asing", hostname: "kali", kind: "attacker", position: { x: 230, y: 320 }, interfaces: [{ name: "eth0", ip: "192.168.1.66/24" }], gateway: "192.168.1.1", ipForward: true },
      {
        id: "r1",
        name: "Router",
        hostname: "router",
        kind: "router",
        position: { x: 460, y: 120 },
        interfaces: [
          { name: "eth0", ip: "192.168.1.1/24" },
          { name: "eth1", ip: "203.0.113.1/24" },
        ],
      },
      { id: "web", name: "web.lab", hostname: "web", kind: "server", position: { x: 690, y: 120 }, interfaces: [{ name: "eth0", ip: "203.0.113.80/24" }], gateway: "203.0.113.1", web: { routes: { "/": { body: "<h1>web.lab</h1>\n" } } } },
    ],
    links: [
      ["pc:eth0", "sw:p1"],
      ["asing:eth0", "sw:p2"],
      ["r1:eth0", "sw:p3"],
      ["r1:eth1", "web:eth0"],
    ],
  },
  objectives: [
    { id: "trace", text: "Lacak jalur ke internet: `traceroute web.lab`. Siapa hop pertama — router 192.168.1.1, atau orang lain?", check: has("traceroute:ok:203.0.113.80") },
    { id: "arp", text: "Lihat tabel ARP (`arp -a`). Perhatikan: **dua IP berbeda punya MAC yang sama**!", check: (ctx) => ctx.facts.has("arp:viewed") && ctx.net.device("pc").arp.has("192.168.1.66") },
    { id: "real", text: "Cari MAC router yang **asli**: klik ikon Router di peta dan lihat interface eth0", check: has("ui:device:r1") },
    {
      id: "static",
      text: "Kunci MAC router yang benar: `sudo arp -s 192.168.1.1 <MAC-asli-router>`",
      check: (ctx) => {
        const entry = ctx.net.device("pc").arp.get("192.168.1.1");
        return !!entry?.static && entry.mac === ctx.net.device("r1").interfaces[0].mac;
      },
    },
    { id: "verify", text: "Jalankan `traceroute web.lab` lagi — hop pertama sekarang harus router asli", requires: ["static"], check: recent("traceroute:ok:203.0.113.80") },
  ],
  hints: [
    "Pada jalur normal, hop pertama traceroute adalah default gateway. Jika muncul IP lain di hop pertama, ada perangkat yang menyisipkan diri di jalur.",
    "Untuk memunculkan IP penyerang di tabel ARP, coba `ping -c 1 192.168.1.66` lalu `arp -a` lagi. MAC yang sama untuk 192.168.1.1 dan 192.168.1.66 adalah bukti ARP spoofing.",
    "Entri statis (PERM) tidak bisa ditimpa ARP reply palsu. Di jaringan besar, admin memakai fitur switch *Dynamic ARP Inspection* agar tidak perlu mengatur satu per satu.",
  ],
};
