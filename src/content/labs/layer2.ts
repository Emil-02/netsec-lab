import type { LabDefinition } from "@/engine";
import { has, NET_COMMANDS, recent } from "./helpers";

export const arpLab: LabDefinition = {
  id: "arp",
  title: "Detektif ARP",
  summary: "Amati bagaimana laptopmu mencari alamat MAC, kapan ARP dipakai, dan kapan tidak.",
  difficulty: "pemula",
  estimatedMinutes: 12,
  xp: 90,
  controllable: ["laptop"],
  allowedCommands: NET_COMMANDS,
  briefing: [
    "Sebelum mengirim paket ke perangkat lain di LAN, laptopmu harus tahu **alamat MAC** tujuan. Untuk itu ia bertanya ke seluruh jaringan memakai **ARP**.",
    "Di lab ini kamu akan melihat tabel ARP terisi, membedah paket ARP, dan membuktikan bahwa untuk tujuan di jaringan lain, yang dicari MAC-nya adalah **gateway**, bukan tujuan akhir.",
  ],
  topology: {
    devices: [
      { id: "laptop", name: "Laptop Kamu", hostname: "laptop", kind: "laptop", position: { x: 0, y: 160 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], gateway: "192.168.1.1" },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 240, y: 160 } },
      { id: "pc", name: "PC Teman", hostname: "pc-teman", kind: "pc", position: { x: 480, y: 20 }, interfaces: [{ name: "eth0", ip: "192.168.1.20/24" }] },
      { id: "printer", name: "Printer", hostname: "printer", kind: "server", position: { x: 480, y: 300 }, interfaces: [{ name: "eth0", ip: "192.168.1.30/24" }] },
      {
        id: "r1",
        name: "Router",
        hostname: "router",
        kind: "router",
        position: { x: 480, y: 160 },
        interfaces: [
          { name: "eth0", ip: "192.168.1.1/24" },
          { name: "eth1", ip: "10.0.0.1/24" },
        ],
      },
      { id: "srv", name: "Server Pusat", hostname: "server-pusat", kind: "server", position: { x: 720, y: 160 }, interfaces: [{ name: "eth0", ip: "10.0.0.5/24" }], gateway: "10.0.0.1" },
    ],
    links: [
      ["laptop:eth0", "sw:p1"],
      ["pc:eth0", "sw:p2"],
      ["printer:eth0", "sw:p3"],
      ["r1:eth0", "sw:p4"],
      ["r1:eth1", "srv:eth0"],
    ],
  },
  objectives: [
    { id: "empty", text: "Lihat tabel ARP laptopmu dengan `ip neigh` (atau `arp -a`) — masih kosong", check: has("arp:viewed") },
    { id: "ping", text: "Ping PC teman (`ping -c 1 192.168.1.20`), lalu cek lagi tabel ARP-nya", check: (ctx) => ctx.net.device("laptop").arp.has("192.168.1.20") },
    { id: "request", text: "Klik paket **ARP Request** di panel Paket: perhatikan MAC tujuan `ff:ff:ff:ff:ff:ff` (broadcast)", check: has("ui:inspect:arp-request") },
    { id: "reply", text: "Klik paket **ARP Reply**: siapa yang menjawab, dan ke mana jawabannya dikirim?", check: has("ui:inspect:arp-reply") },
    {
      id: "remote",
      text: "Ping server di jaringan lain (`ping -c 1 10.0.0.5`). Cek tabel ARP: MAC siapa yang dicari — server, atau **gateway**?",
      check: (ctx) => {
        const arp = ctx.net.device("laptop").arp;
        return ctx.facts.has("ping:ok:10.0.0.5") && arp.has("192.168.1.1") && !arp.has("10.0.0.5");
      },
    },
    { id: "flush", text: "Kosongkan tabel ARP: `sudo ip neigh flush all`", check: has("arp:flushed") },
    {
      id: "again",
      text: "Ping PC teman sekali lagi dan lihat ARP broadcast muncul kembali",
      requires: ["flush"],
      check: recent("ping:ok:laptop>192.168.1.20"),
    },
  ],
  hints: [
    "Perlambat animasi ke 0.5× agar paket ARP (kuning) terlihat jelas sebelum paket ICMP (biru).",
    "ARP Request dikirim ke semua (broadcast), ARP Reply dikirim langsung (unicast) ke penanya.",
    "Laptop hanya ARP untuk perangkat di subnet yang sama. Untuk 10.0.0.5, paket diserahkan ke gateway 192.168.1.1, jadi yang dicari adalah MAC router.",
  ],
};

export const macTableLab: LabDefinition = {
  id: "mac-table",
  title: "Switch Belajar MAC Address",
  summary: "Saksikan switch mengisi MAC address table-nya, lalu lihat apa yang terjadi saat tabel itu dikosongkan.",
  difficulty: "pemula",
  estimatedMinutes: 12,
  xp: 90,
  controllable: ["pc1", "sw"],
  allowedCommands: [...NET_COMMANDS, "show", "switchport"],
  briefing: [
    "Switch tidak tahu apa-apa saat pertama dinyalakan. Ia **belajar** dengan mencatat MAC sumber setiap frame yang masuk beserta port asalnya.",
    "Kamu bisa mengendalikan **PC-1** dan **Switch**. Di terminal switch, gunakan perintah ala switch sungguhan seperti `show mac address-table`.",
  ],
  topology: {
    devices: [
      { id: "pc1", name: "PC-1", hostname: "pc-1", kind: "pc", position: { x: 0, y: 40 }, interfaces: [{ name: "eth0", ip: "192.168.5.11/24" }] },
      { id: "pc2", name: "PC-2", hostname: "pc-2", kind: "pc", position: { x: 0, y: 280 }, interfaces: [{ name: "eth0", ip: "192.168.5.12/24" }] },
      { id: "sw", name: "Switch", hostname: "Switch", kind: "switch", position: { x: 260, y: 160 } },
      { id: "pc3", name: "PC-3", hostname: "pc-3", kind: "pc", position: { x: 520, y: 40 }, interfaces: [{ name: "eth0", ip: "192.168.5.13/24" }] },
      { id: "pc4", name: "PC-4", hostname: "pc-4", kind: "pc", position: { x: 520, y: 280 }, interfaces: [{ name: "eth0", ip: "192.168.5.14/24" }] },
    ],
    links: [
      ["pc1:eth0", "sw:p1"],
      ["pc2:eth0", "sw:p2"],
      ["pc3:eth0", "sw:p3"],
      ["pc4:eth0", "sw:p4"],
    ],
  },
  objectives: [
    { id: "look", text: "Lihat tabel MAC switch: pilih **Switch** di menu Perangkat lalu ketik `show mac address-table` (atau klik ikon switch)", check: (ctx) => ctx.facts.has("switch:show-mac:sw") || ctx.facts.has("ui:device:sw") },
    { id: "two", text: "Dari **PC-1**, ping PC-2 (192.168.5.12). Sekarang switch mengenal 2 MAC", check: (ctx) => ctx.net.device("sw").macTable.size >= 2 },
    { id: "full", text: "Ping juga PC-3 dan PC-4 sampai tabel MAC berisi **4** entri", check: (ctx) => ctx.net.device("sw").macTable.size >= 4 },
    { id: "clear", text: "Di switch, kosongkan tabelnya: `clear mac address-table`", requires: ["full"], check: has("switch:clear-mac:sw") },
    {
      id: "flood",
      text: "Dari PC-1 ping PC-2 lagi. Perhatikan: frame ICMP kini **dibanjiri (flood)** ke semua port karena switch lupa!",
      requires: ["clear"],
      check: recent("ping:ok:pc1>192.168.5.12"),
    },
  ],
  hints: [
    "Ganti perangkat yang dikendalikan lewat dropdown di atas terminal.",
    "Setelah tabel dikosongkan, PC-1 masih ingat MAC PC-2 (tabel ARP-nya), jadi ia langsung mengirim frame unicast. Tapi switch belum tahu port PC-2 → frame dikirim ke semua port (unknown unicast flooding).",
    "Frame yang sampai ke PC yang salah akan diabaikan (tanda ✕).",
  ],
};

export const vlanLab: LabDefinition = {
  id: "vlan",
  title: "Memisahkan Jaringan dengan VLAN",
  summary: "Pisahkan PC divisi HRD dari staf lain tanpa menambah switch baru, lalu amati tag 802.1Q di link trunk.",
  difficulty: "menengah",
  estimatedMinutes: 18,
  xp: 130,
  controllable: ["staf1", "hrd1", "sw1", "sw2"],
  allowedCommands: [...NET_COMMANDS, "show", "switchport"],
  briefing: [
    "Kantor ini punya dua switch yang terhubung dengan link **trunk** (port p8). Semua PC masih berada di VLAN 1, jadi PC staf bisa menjangkau PC HRD yang menyimpan data gaji. Bahaya!",
    "Tugasmu: pindahkan kedua PC HRD ke **VLAN 20**. Mereka harus tetap bisa saling berkomunikasi lewat trunk, tapi terisolasi dari staf.",
  ],
  topology: {
    devices: [
      { id: "staf1", name: "Staf-1", hostname: "staf-1", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.11/24" }] },
      { id: "staf2", name: "Staf-2", hostname: "staf-2", kind: "pc", position: { x: 0, y: 170 }, interfaces: [{ name: "eth0", ip: "10.0.0.12/24" }] },
      { id: "hrd1", name: "HRD-1", hostname: "hrd-1", kind: "pc", position: { x: 0, y: 340 }, interfaces: [{ name: "eth0", ip: "10.0.0.21/24" }] },
      { id: "sw1", name: "Switch-1", hostname: "Switch-1", kind: "switch", position: { x: 240, y: 170 }, ports: { p8: { trunk: true } } },
      { id: "sw2", name: "Switch-2", hostname: "Switch-2", kind: "switch", position: { x: 500, y: 170 }, ports: { p8: { trunk: true } } },
      { id: "hrd2", name: "HRD-2", hostname: "hrd-2", kind: "pc", position: { x: 740, y: 60 }, interfaces: [{ name: "eth0", ip: "10.0.0.22/24" }] },
      { id: "staf3", name: "Staf-3", hostname: "staf-3", kind: "pc", position: { x: 740, y: 280 }, interfaces: [{ name: "eth0", ip: "10.0.0.13/24" }] },
    ],
    links: [
      ["staf1:eth0", "sw1:p1"],
      ["staf2:eth0", "sw1:p2"],
      ["hrd1:eth0", "sw1:p3"],
      ["sw1:p8", "sw2:p8"],
      ["hrd2:eth0", "sw2:p1"],
      ["staf3:eth0", "sw2:p2"],
    ],
  },
  objectives: [
    { id: "problem", text: "Buktikan masalahnya: dari **Staf-1**, ping HRD-1 (`ping -c 1 10.0.0.21`) — berhasil, padahal seharusnya tidak boleh", check: has("ping:ok:staf1>10.0.0.21") },
    { id: "show", text: "Di **Switch-1**, lihat konfigurasi VLAN dengan `show vlan`", check: has("switch:show-vlan:sw1") },
    { id: "sw1", text: "Di Switch-1, pindahkan port HRD-1 ke VLAN 20: `switchport p3 vlan 20`", check: (ctx) => ctx.net.device("sw1").interfaces.find((i) => i.name === "p3")?.vlan === 20 },
    { id: "sw2", text: "Di **Switch-2**, pindahkan port HRD-2 (p1) ke VLAN 20", check: (ctx) => ctx.net.device("sw2").interfaces.find((i) => i.name === "p1")?.vlan === 20 },
    { id: "isolated", text: "Dari Staf-1, ping HRD-1 lagi — sekarang harus **gagal**", requires: ["sw1", "sw2"], check: recent("ping:fail:staf1>10.0.0.21") },
    { id: "trunk", text: "Dari **HRD-1**, ping HRD-2 (10.0.0.22) — harus tetap berhasil melewati trunk", requires: ["sw1", "sw2"], check: recent("ping:ok:hrd1>10.0.0.22") },
    { id: "tag", text: "Klik paket yang melintasi link trunk (Switch-1 ↔ Switch-2) dan temukan **tag 802.1Q VLAN 20**", requires: ["trunk"], check: has("ui:inspect:vlan-tag") },
  ],
  hints: [
    "Pilih Switch-1 di dropdown Perangkat. Prompt-nya berubah menjadi `Switch-1#`.",
    "Port mana yang terhubung ke HRD-1? Ketik `show interfaces` di switch, atau klik ikon switch di peta.",
    "VLAN hanya bisa diseberangkan antar switch lewat port trunk. Saat frame VLAN 20 lewat trunk, switch menempelkan tag 802.1Q agar switch di seberang tahu frame itu milik VLAN mana.",
  ],
};
