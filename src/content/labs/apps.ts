import type { HttpRequest, LabDefinition } from "@/engine";
import { resolversOf } from "@/engine/protocols/dns";
import { has, NET_COMMANDS, recent } from "./helpers";

const DNS_TOOLS = ["nslookup", "dig", "host", "curl", "tee"];

export const dnsLab: LabDefinition = {
  id: "dns",
  title: "Memperbaiki DNS yang Rusak",
  summary: "Nama-nama website tidak bisa dibuka padahal jaringan normal. Lacak masalahnya dan perbaiki konfigurasi DNS.",
  difficulty: "menengah",
  estimatedMinutes: 18,
  xp: 140,
  controllable: ["pc"],
  allowedCommands: [...NET_COMMANDS, ...DNS_TOOLS],
  briefing: [
    "Pengguna di kantor mengeluh: \"Internet mati! Website intranet tidak bisa dibuka!\" Tapi ping ke alamat IP berjalan lancar…",
    "Admin sebelumnya mengatakan DNS server kantor ada di **10.0.0.53**. DNS server itu menjawab nama-nama `*.kantor.lab` sendiri, dan meneruskan (forward) nama lainnya ke DNS publik.",
  ],
  topology: {
    devices: [
      { id: "pc", name: "PC Kamu", hostname: "pc", kind: "pc", position: { x: 0, y: 140 }, interfaces: [{ name: "eth0", ip: "10.0.0.10/24" }], gateway: "10.0.0.1", dns: ["10.0.0.99"] },
      { id: "sw1", name: "Switch Kantor", kind: "switch", position: { x: 220, y: 140 } },
      {
        id: "dnsk",
        name: "DNS Kantor",
        hostname: "ns1",
        kind: "server",
        position: { x: 220, y: -40 },
        interfaces: [{ name: "eth0", ip: "10.0.0.53/24" }],
        gateway: "10.0.0.1",
        dnsServer: {
          records: [
            { name: "web.kantor.lab", type: "A", value: "10.0.0.80" },
            { name: "intranet.kantor.lab", type: "CNAME", value: "web.kantor.lab" },
            { name: "mail.kantor.lab", type: "A", value: "10.0.0.25" },
            { name: "kantor.lab", type: "MX", value: "mail.kantor.lab" },
            { name: "kantor.lab", type: "TXT", value: "v=spf1 mx -all" },
          ],
          forwarder: "203.0.113.53",
        },
      },
      {
        id: "webk",
        name: "Web Intranet",
        hostname: "web",
        kind: "server",
        position: { x: 220, y: 320 },
        interfaces: [{ name: "eth0", ip: "10.0.0.80/24" }],
        gateway: "10.0.0.1",
        web: { routes: { "/": { body: "<h1>Intranet Kantor</h1>\n<p>Pengumuman: rapat jam 10.00 di ruang server.</p>\n" } } },
      },
      {
        id: "r1",
        name: "Router",
        hostname: "router",
        kind: "router",
        position: { x: 440, y: 140 },
        interfaces: [
          { name: "eth0", ip: "10.0.0.1/24" },
          { name: "eth1", ip: "203.0.113.1/24" },
        ],
      },
      { id: "sw2", name: "Internet", kind: "switch", position: { x: 640, y: 140 } },
      {
        id: "dnsp",
        name: "DNS Publik",
        hostname: "dns-publik",
        kind: "server",
        position: { x: 860, y: 20 },
        interfaces: [{ name: "eth0", ip: "203.0.113.53/24" }],
        gateway: "203.0.113.1",
        dnsServer: { records: [{ name: "netseclab.id", type: "A", value: "203.0.113.80" }, { name: "www.netseclab.id", type: "CNAME", value: "netseclab.id" }] },
      },
      {
        id: "webp",
        name: "netseclab.id",
        hostname: "netseclab",
        kind: "server",
        position: { x: 860, y: 260 },
        interfaces: [{ name: "eth0", ip: "203.0.113.80/24" }],
        gateway: "203.0.113.1",
        web: { routes: { "/": { body: "<h1>NetSec Lab</h1>\n" } } },
      },
    ],
    links: [
      ["pc:eth0", "sw1:p1"],
      ["dnsk:eth0", "sw1:p2"],
      ["webk:eth0", "sw1:p3"],
      ["r1:eth0", "sw1:p4"],
      ["r1:eth1", "sw2:p1"],
      ["dnsp:eth0", "sw2:p2"],
      ["webp:eth0", "sw2:p3"],
    ],
  },
  objectives: [
    { id: "symptom", text: "Reproduksi keluhan: `ping web.kantor.lab` gagal, padahal `ping 10.0.0.80` berhasil", check: (ctx) => ctx.facts.has("dns:fail:web.kantor.lab") && ctx.facts.has("ping:ok:10.0.0.80") },
    { id: "resolv", text: "Cek DNS server yang dipakai PC: `cat /etc/resolv.conf`", check: has("cat:/etc/resolv.conf") },
    { id: "direct", text: "Tanya langsung ke DNS kantor: `nslookup web.kantor.lab 10.0.0.53`", check: (ctx) => ctx.facts.has("dns:server:10.0.0.53") && ctx.facts.has("dns:ok:web.kantor.lab") },
    { id: "fix", text: "Perbaiki `/etc/resolv.conf` agar memakai **10.0.0.53**", check: (ctx) => resolversOf(ctx.net.device("pc"))[0] === "10.0.0.53" },
    { id: "cname", text: "Buka intranet lewat namanya: `curl http://intranet.kantor.lab` (nama ini adalah CNAME!)", requires: ["fix"], check: has("curl:ok:intranet.kantor.lab/") },
    { id: "forward", text: "Resolve nama di internet: `dig netseclab.id` — perhatikan DNS kantor meneruskan pertanyaannya ke DNS publik", requires: ["fix"], check: has("dns:ok:netseclab.id:A") },
    { id: "mx", text: "Cari server email kantor: `dig kantor.lab MX`", check: has("dns:ok:kantor.lab:MX") },
  ],
  hints: [
    "Kalau ping ke IP berhasil tapi ke nama gagal, masalahnya hampir pasti di DNS.",
    "File /etc/resolv.conf milik root. `echo ... > /etc/resolv.conf` tidak akan berhasil walau pakai sudo, karena redirect `>` dijalankan oleh shell-mu (bukan root). Gunakan: `echo \"nameserver 10.0.0.53\" | sudo tee /etc/resolv.conf`",
    "Di panel Paket, paket DNS berwarna biru muda dan memakai UDP port 53.",
  ],
};

export const dhcpLab: LabDefinition = {
  id: "dhcp",
  title: "Dapat IP Otomatis dengan DHCP",
  summary: "Laptop baru tersambung tanpa konfigurasi apa pun. Minta alamat IP ke DHCP server dan amati proses DORA.",
  difficulty: "pemula",
  estimatedMinutes: 12,
  xp: 100,
  controllable: ["laptop"],
  allowedCommands: [...NET_COMMANDS, "dhclient", "curl", "nslookup", "dig"],
  briefing: [
    "Di lab sebelumnya kamu mengatur IP secara manual. Di dunia nyata, hampir semua perangkat mendapat IP **otomatis** dari **DHCP server** — biasanya router Wi-Fi di rumah.",
    "Laptop ini baru dicolokkan dan belum punya IP sama sekali. Mintalah alamat IP, gateway, dan DNS server dari router.",
  ],
  topology: {
    devices: [
      { id: "laptop", name: "Laptop Baru", hostname: "laptop", kind: "laptop", position: { x: 0, y: 120 }, interfaces: [{ name: "eth0" }] },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 240, y: 120 } },
      { id: "pc", name: "PC Lain", hostname: "pc", kind: "pc", position: { x: 240, y: 320 }, interfaces: [{ name: "eth0", ip: "192.168.1.20/24" }], gateway: "192.168.1.1" },
      {
        id: "router",
        name: "Router Wi-Fi",
        hostname: "router",
        kind: "router",
        position: { x: 480, y: 120 },
        interfaces: [{ name: "eth0", ip: "192.168.1.1/24" }],
        dhcpServer: { iface: "eth0", start: "192.168.1.100", end: "192.168.1.150", prefix: 24, gateway: "192.168.1.1", dns: ["192.168.1.1"] },
        dnsServer: { records: [{ name: "printer.lan", type: "A", value: "192.168.1.50" }, { name: "router.lan", type: "A", value: "192.168.1.1" }] },
      },
      {
        id: "printer",
        name: "Printer",
        hostname: "printer",
        kind: "server",
        position: { x: 480, y: 320 },
        interfaces: [{ name: "eth0", ip: "192.168.1.50/24" }],
        gateway: "192.168.1.1",
        web: { software: "PrinterWeb/1.0", routes: { "/": { body: "<h1>Printer Lantai 2</h1>\n<p>Status: Siap. Tinta hitam 64%.</p>\n" } } },
      },
    ],
    links: [
      ["laptop:eth0", "sw:p1"],
      ["pc:eth0", "sw:p2"],
      ["router:eth0", "sw:p3"],
      ["printer:eth0", "sw:p4"],
    ],
  },
  objectives: [
    { id: "noip", text: "Cek konfigurasi: `ip a` — eth0 belum punya alamat IP", check: has("ip:viewed:laptop") },
    { id: "nonet", text: "Coba `ping 192.168.1.1` — gagal karena laptop belum punya IP", check: has("ping:unreachable:192.168.1.1") },
    { id: "dhcp", text: "Minta IP ke DHCP server: `sudo dhclient -v eth0`", check: (ctx) => [...ctx.facts].some((f) => f.startsWith("dhcp:bound:eth0:")) },
    { id: "inspect", text: "Klik salah satu paket **DHCP** (Discover/Offer/Request/ACK) dan baca isinya", check: has("ui:inspect:DHCP") },
    { id: "route", text: "Lihat default gateway yang diberikan DHCP: `ip route`", requires: ["dhcp"], check: recent("route:viewed:laptop") },
    { id: "resolv", text: "Lihat DNS server yang diberikan DHCP: `cat /etc/resolv.conf`", requires: ["dhcp"], check: recent("cat:/etc/resolv.conf") },
    { id: "printer", text: "Buka halaman admin printer lewat namanya: `curl http://printer.lan`", check: has("curl:ok:printer.lan/") },
  ],
  hints: [
    "dhclient butuh hak admin karena mengubah konfigurasi jaringan.",
    "DORA = Discover (broadcast: \"ada DHCP server?\"), Offer (\"pakai IP ini\"), Request (\"oke, saya ambil\"), Acknowledge (\"disetujui\").",
    "Discover dan Request dikirim dari 0.0.0.0 ke 255.255.255.255, karena laptop belum punya IP dan belum tahu alamat server.",
  ],
};

function loginRoute(req: HttpRequest) {
  if (req.method !== "POST") {
    return {
      body: `<form method="POST" action="/login">\n  <input name="user"> <input name="pass" type="password">\n  <button>Masuk</button>\n</form>\n`,
    };
  }
  if (req.form.user === "siswa" && req.form.pass === "netsec123") {
    return { headers: { "Set-Cookie": "sesi=7f3a9c21; HttpOnly" }, body: `Login berhasil. Selamat datang, ${req.form.user}!\n` };
  }
  return { status: 401, body: "Username atau password salah.\n" };
}

export const httpLab: LabDefinition = {
  id: "http",
  title: "Menjelajah Web dengan curl",
  summary: "Pahami request & response HTTP, status code, header, redirect, robots.txt, dan bahaya login tanpa HTTPS.",
  difficulty: "menengah",
  estimatedMinutes: 20,
  xp: 150,
  controllable: ["pc"],
  allowedCommands: [...NET_COMMANDS, "curl", "nslookup", "dig"],
  briefing: [
    "Browser sebenarnya hanya mengirim teks HTTP ke server dan menampilkan balasannya. Dengan `curl`, kamu bisa melihat percakapan itu apa adanya.",
    "Jelajahi **toko.lab**, temukan halaman tersembunyi, lalu bandingkan login lewat **HTTP** dan **HTTPS** di panel Paket. Kredensial lab: user `siswa`, password `netsec123`.",
  ],
  topology: {
    devices: [
      { id: "pc", name: "PC Kamu", hostname: "pc", kind: "pc", position: { x: 0, y: 120 }, interfaces: [{ name: "eth0", ip: "10.0.0.10/24" }], dns: ["10.0.0.53"] },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 260, y: 120 } },
      {
        id: "dns",
        name: "DNS Server",
        hostname: "ns1",
        kind: "server",
        position: { x: 260, y: 320 },
        interfaces: [{ name: "eth0", ip: "10.0.0.53/24" }],
        dnsServer: { records: [{ name: "toko.lab", type: "A", value: "10.0.0.80" }, { name: "www.toko.lab", type: "CNAME", value: "toko.lab" }] },
      },
      {
        id: "web",
        name: "toko.lab",
        hostname: "toko",
        kind: "server",
        position: { x: 520, y: 120 },
        interfaces: [{ name: "eth0", ip: "10.0.0.80/24" }],
        web: {
          https: true,
          software: "nginx/1.24.0",
          routes: {
            "/": { body: `<h1>Toko Lab</h1>\n<a href="/produk">Produk</a> | <a href="/login">Login</a>\n` },
            "/produk": { body: "1. Kabel UTP Cat6 - Rp5.000/m\n2. Switch 8 port - Rp250.000\n3. Router Wi-Fi - Rp450.000\n" },
            "/lama": { status: 301, headers: { Location: "/produk" }, body: "<h1>301 Moved Permanently</h1>\n" },
            "/admin": { status: 403, body: "<h1>403 Forbidden</h1>\n" },
            "/robots.txt": { body: "User-agent: *\nDisallow: /admin\nDisallow: /cadangan-lama\n" },
            "/cadangan-lama": { body: "Arsip lama. Catatan admin: FLAG{robots-txt-bukan-pengaman}\n" },
            "/login": loginRoute,
          },
        },
      },
    ],
    links: [
      ["pc:eth0", "sw:p1"],
      ["dns:eth0", "sw:p2"],
      ["web:eth0", "sw:p3"],
    ],
  },
  objectives: [
    { id: "get", text: "Ambil halaman utama: `curl http://toko.lab`", check: has("curl:ok:toko.lab/") },
    { id: "headers", text: "Lihat percakapan lengkapnya (request & response header) dengan `curl -v` atau `curl -I`", check: has("curl:headers") },
    { id: "404", text: "Minta halaman yang tidak ada dan dapatkan status **404**", check: (ctx) => [...ctx.facts].some((f) => f.startsWith("curl:404:")) },
    { id: "redirect", text: "Halaman `/lama` sudah dipindah (301). Ikuti redirect-nya dengan `curl -L`", check: (ctx) => ctx.facts.has("curl:301:toko.lab/lama") && ctx.facts.has("curl:ok:toko.lab/produk") },
    { id: "robots", text: "Baca `/robots.txt`, lalu buka halaman yang \"disembunyikan\" di sana dan temukan FLAG", check: has("curl:ok:toko.lab/cadangan-lama") },
    {
      id: "http-login",
      text: "Login lewat HTTP: `curl -d \"user=siswa&pass=netsec123\" http://toko.lab/login`, lalu klik paket POST-nya. Password terbaca jelas! 😱",
      check: (ctx) => ctx.facts.has("curl:post:http:toko.lab/login") && ctx.facts.has("ui:inspect:http-password"),
    },
    {
      id: "https-login",
      text: "Ulangi lewat **https://** dan klik paket *Application Data*-nya. Bisakah password-nya dibaca?",
      check: (ctx) => ctx.facts.has("curl:post:https:toko.lab/login") && ctx.facts.has("ui:inspect:tls-data"),
    },
  ],
  hints: [
    "Status code: 2xx = berhasil, 3xx = pindah/redirect, 4xx = kesalahan dari sisi client (404 tidak ditemukan, 403 dilarang), 5xx = server error.",
    "robots.txt hanya permintaan sopan untuk mesin pencari agar tidak mengindeks halaman tertentu. Siapa pun tetap bisa membuka halaman itu — jangan pernah menyimpan rahasia di sana!",
    "Pada HTTP, isi request dikirim sebagai teks biasa. Siapa pun yang bisa menyadap jaringan (ingat hub!) dapat membacanya. HTTPS membungkusnya dengan enkripsi TLS.",
  ],
};
