import { inSubnet, type LabDefinition } from "@/engine";
import { has } from "./helpers";

const NET_COMMANDS = ["ping", "ip", "ifconfig", "arp", "route", "traceroute", "whoami", "hostname", "man", "history", "ls", "cat", "pwd", "cd", "echo", "grep"];

export const hubVsSwitch: LabDefinition = {
  id: "hub-vs-switch",
  title: "Hub vs Switch",
  summary: "Bandingkan bagaimana hub dan switch meneruskan frame. Mana yang lebih efisien dan aman?",
  difficulty: "pemula",
  estimatedMinutes: 12,
  xp: 80,
  controllable: ["a1", "b1"],
  allowedCommands: NET_COMMANDS,
  briefing: [
    "Ada dua jaringan terpisah. Jaringan A (atas) memakai **hub**, jaringan B (bawah) memakai **switch**.",
    "Kirim ping di kedua jaringan dan amati: perangkat mana saja yang ikut menerima paket? Gunakan pemilih perangkat di atas terminal untuk berpindah antara PC-A1 dan PC-B1.",
  ],
  topology: {
    devices: [
      { id: "a1", name: "PC-A1", hostname: "pc-a1", kind: "pc", position: { x: 0, y: 40 }, interfaces: [{ name: "eth0", ip: "10.0.0.1/24" }] },
      { id: "hubA", name: "Hub", kind: "hub", position: { x: 240, y: 40 } },
      { id: "a2", name: "PC-A2", hostname: "pc-a2", kind: "pc", position: { x: 480, y: -40 }, interfaces: [{ name: "eth0", ip: "10.0.0.2/24" }] },
      { id: "a3", name: "PC-A3", hostname: "pc-a3", kind: "pc", position: { x: 480, y: 120 }, interfaces: [{ name: "eth0", ip: "10.0.0.3/24" }] },
      { id: "b1", name: "PC-B1", hostname: "pc-b1", kind: "pc", position: { x: 0, y: 320 }, interfaces: [{ name: "eth0", ip: "10.0.1.1/24" }] },
      { id: "swB", name: "Switch", kind: "switch", position: { x: 240, y: 320 } },
      { id: "b2", name: "PC-B2", hostname: "pc-b2", kind: "pc", position: { x: 480, y: 240 }, interfaces: [{ name: "eth0", ip: "10.0.1.2/24" }] },
      { id: "b3", name: "PC-B3", hostname: "pc-b3", kind: "pc", position: { x: 480, y: 400 }, interfaces: [{ name: "eth0", ip: "10.0.1.3/24" }] },
    ],
    links: [
      ["a1:eth0", "hubA:p1"],
      ["a2:eth0", "hubA:p2"],
      ["a3:eth0", "hubA:p3"],
      ["b1:eth0", "swB:p1"],
      ["b2:eth0", "swB:p2"],
      ["b3:eth0", "swB:p3"],
    ],
  },
  objectives: [
    { id: "hub", text: "Dari **PC-A1**, ping PC-A3 (`ping -c 2 10.0.0.3`). Perhatikan: PC-A2 ikut menerima paket!", check: has("ping:ok:10.0.0.3") },
    { id: "switch", text: "Pindah ke **PC-B1**, lalu ping PC-B3 (`ping -c 2 10.0.1.3`). Apakah PC-B2 ikut menerima?", check: has("ping:ok:10.0.1.3") },
    { id: "mac", text: "Klik ikon **Switch** di peta untuk melihat MAC address table yang sudah dipelajarinya", check: has("ui:device:swB") },
    { id: "hubinfo", text: "Klik ikon **Hub**: apakah hub punya tabel MAC?", check: has("ui:device:hubA") },
  ],
  hints: [
    "Pilih perangkat yang dikendalikan di dropdown atas terminal.",
    "Frame yang diabaikan ditampilkan transparan dengan tanda ✕ — artinya NIC menerima sinyal tapi membuangnya karena MAC tujuan bukan miliknya.",
    "Pada hub, siapa pun di jaringan bisa 'menguping' lalu lintas orang lain. Ini dasar dari serangan sniffing yang akan kamu pelajari nanti!",
  ],
};

export const enkapsulasi: LabDefinition = {
  id: "enkapsulasi",
  title: "Membedah Paket: Enkapsulasi",
  summary: "Kirim paket melewati router dan bedah setiap lapisannya: Ethernet, IP, ICMP.",
  difficulty: "pemula",
  estimatedMinutes: 15,
  xp: 90,
  controllable: ["pc"],
  allowedCommands: NET_COMMANDS,
  briefing: [
    "Paket data dibungkus berlapis-lapis seperti paket kiriman: ada amplop Ethernet (alamat MAC), di dalamnya amplop IP (alamat IP), lalu isi pesannya (ICMP).",
    "Di lab ini kamu akan mengirim paket ke server di jaringan lain dan melihat lapisan mana yang berubah saat melewati router.",
  ],
  topology: {
    devices: [
      { id: "pc", name: "PC Kamu", hostname: "pc", kind: "pc", position: { x: 0, y: 120 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], gateway: "192.168.1.1", hosts: { server: "10.10.0.80" } },
      { id: "sw1", name: "Switch", kind: "switch", position: { x: 220, y: 120 } },
      {
        id: "r1",
        name: "Router",
        hostname: "router",
        kind: "router",
        position: { x: 440, y: 120 },
        interfaces: [
          { name: "eth0", ip: "192.168.1.1/24" },
          { name: "eth1", ip: "10.10.0.1/24" },
        ],
      },
      { id: "srv", name: "Web Server", hostname: "server", kind: "server", position: { x: 680, y: 120 }, interfaces: [{ name: "eth0", ip: "10.10.0.80/24" }], gateway: "10.10.0.1" },
    ],
    links: [
      ["pc:eth0", "sw1:p1"],
      ["r1:eth0", "sw1:p2"],
      ["r1:eth1", "srv:eth0"],
    ],
  },
  objectives: [
    { id: "ping", text: "Ping server: `ping -c 1 server`", check: has("ping:ok:10.10.0.80") },
    { id: "inspect", text: "Klik paket **ICMP Echo Request** di panel Paket dan perhatikan lapisan-lapisannya", check: has("ui:packet-inspected") },
    { id: "compare", text: "Bandingkan paket ICMP **sebelum** dan **sesudah** router: MAC berubah, IP tetap! (klik minimal 2 paket ICMP)", check: has("ui:compared-hops") },
    { id: "trace", text: "Lacak jalur ke server dengan `traceroute server`", check: has("traceroute:ok:10.10.0.80") },
  ],
  hints: [
    "Perlambat animasi agar kamu bisa melihat paket menyeberang router.",
    "Di inspektor paket, lapisan Layer 2 (Ethernet) berisi MAC sumber & tujuan. Saat melewati router, router membuat 'amplop' Ethernet baru!",
    "Perhatikan juga nilai TTL di lapisan IP: berkurang 1 setiap melewati router.",
  ],
};

export const konfigurasiIp: LabDefinition = {
  id: "konfigurasi-ip",
  title: "Konfigurasi IP & Gateway",
  summary: "Sebuah PC baru belum punya alamat IP. Konfigurasikan agar bisa terhubung ke server di jaringan lain.",
  difficulty: "menengah",
  estimatedMinutes: 15,
  xp: 120,
  controllable: ["baru"],
  allowedCommands: NET_COMMANDS,
  briefing: [
    "PC baru baru saja dicolok ke jaringan kantor 192.168.10.0/24, tapi belum dikonfigurasi. Router kantor ada di 192.168.10.1 dan PC rekan kerja di 192.168.10.20.",
    "Server aplikasi berada di jaringan lain: 172.16.0.10. Buat PC baru bisa menjangkaunya!",
  ],
  topology: {
    devices: [
      { id: "baru", name: "PC Baru", hostname: "pc-baru", kind: "pc", position: { x: 0, y: 40 }, interfaces: [{ name: "eth0" }] },
      { id: "rekan", name: "PC Rekan", hostname: "pc-rekan", kind: "pc", position: { x: 0, y: 260 }, interfaces: [{ name: "eth0", ip: "192.168.10.20/24" }], gateway: "192.168.10.1" },
      { id: "sw1", name: "Switch Kantor", kind: "switch", position: { x: 220, y: 150 } },
      {
        id: "r1",
        name: "Router",
        hostname: "router",
        kind: "router",
        position: { x: 440, y: 150 },
        interfaces: [
          { name: "eth0", ip: "192.168.10.1/24" },
          { name: "eth1", ip: "172.16.0.1/24" },
        ],
      },
      { id: "srv", name: "Server Aplikasi", hostname: "app-server", kind: "server", position: { x: 680, y: 150 }, interfaces: [{ name: "eth0", ip: "172.16.0.10/24" }], gateway: "172.16.0.1" },
    ],
    links: [
      ["baru:eth0", "sw1:p1"],
      ["rekan:eth0", "sw1:p2"],
      ["r1:eth0", "sw1:p3"],
      ["r1:eth1", "srv:eth0"],
    ],
  },
  objectives: [
    { id: "view", text: "Periksa konfigurasi awal dengan `ip a` — eth0 belum punya IP", check: has("ip:viewed") },
    {
      id: "addr",
      text: "Beri eth0 alamat IP yang **valid & belum dipakai** di jaringan 192.168.10.0/24 dengan prefix /24",
      check: (ctx) => {
        const iface = ctx.net.device("baru").interfaces[0];
        if (!iface.ip || iface.prefix !== 24 || !inSubnet(iface.ip, "192.168.10.0", 24)) return false;
        return !["192.168.10.0", "192.168.10.1", "192.168.10.20", "192.168.10.255"].includes(iface.ip);
      },
    },
    { id: "lan", text: "Ping PC rekan (192.168.10.20) untuk menguji koneksi lokal", check: has("ping:ok:192.168.10.20") },
    { id: "gw", text: "Atur default gateway ke router (192.168.10.1)", check: (ctx) => ctx.net.device("baru").routes.some((r) => r.prefix === 0 && r.via === "192.168.10.1") },
    { id: "srv", text: "Ping server aplikasi 172.16.0.10 🎉", check: has("ping:ok:172.16.0.10") },
  ],
  hints: [
    "Mengubah konfigurasi jaringan butuh hak admin, jadi gunakan `sudo`.",
    "Contoh: `sudo ip addr add 192.168.10.50/24 dev eth0`. Jangan pakai .1 (router), .20 (rekan), .0 (alamat network), atau .255 (broadcast)!",
    "Tanpa gateway, PC hanya bisa bicara dengan jaringan lokalnya. Atur dengan `sudo ip route add default via 192.168.10.1`, lalu cek `ip route`.",
  ],
};
