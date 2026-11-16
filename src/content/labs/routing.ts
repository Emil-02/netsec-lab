import type { LabDefinition } from "@/engine";
import { has, NET_COMMANDS, recent } from "./helpers";

export const staticRouteLab: LabDefinition = {
  id: "static-route",
  title: "Menyambung Dua Kantor dengan Static Route",
  summary: "Dua router belum saling tahu jaringan di belakang masing-masing. Ajari mereka jalannya!",
  difficulty: "menengah",
  estimatedMinutes: 18,
  xp: 140,
  controllable: ["pca", "r1", "r2"],
  allowedCommands: NET_COMMANDS,
  briefing: [
    "Kantor A (192.168.1.0/24) dan Kantor B (192.168.2.0/24) dihubungkan oleh dua router lewat link 10.0.0.0/30. Masalahnya: setiap router hanya mengenal jaringan yang **terhubung langsung** dengannya.",
    "Kamu bisa mengendalikan PC-A, R1, dan R2. Router di sini adalah Linux biasa, jadi kamu memakai perintah `ip route` yang sama seperti di PC.",
  ],
  topology: {
    devices: [
      { id: "pca", name: "PC-A", hostname: "pc-a", kind: "pc", position: { x: 0, y: 120 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], gateway: "192.168.1.1" },
      {
        id: "r1",
        name: "R1",
        hostname: "r1",
        kind: "router",
        position: { x: 240, y: 120 },
        interfaces: [
          { name: "eth0", ip: "192.168.1.1/24" },
          { name: "eth1", ip: "10.0.0.1/30" },
        ],
      },
      {
        id: "r2",
        name: "R2",
        hostname: "r2",
        kind: "router",
        position: { x: 480, y: 120 },
        interfaces: [
          { name: "eth0", ip: "10.0.0.2/30" },
          { name: "eth1", ip: "192.168.2.1/24" },
        ],
      },
      { id: "pcb", name: "PC-B", hostname: "pc-b", kind: "pc", position: { x: 720, y: 120 }, interfaces: [{ name: "eth0", ip: "192.168.2.10/24" }], gateway: "192.168.2.1" },
    ],
    links: [
      ["pca:eth0", "r1:eth0"],
      ["r1:eth1", "r2:eth0"],
      ["r2:eth1", "pcb:eth0"],
    ],
  },
  objectives: [
    { id: "fail", text: "Dari **PC-A**, ping PC-B (`ping -c 1 192.168.2.10`). Perhatikan siapa yang menjawab *Destination Net Unreachable*", check: has("ping:fail:pca>192.168.2.10") },
    { id: "view", text: "Pindah ke **R1** dan lihat tabel routing-nya dengan `ip route`", check: has("route:viewed:r1") },
    {
      id: "r1",
      text: "Di R1, tambahkan rute ke 192.168.2.0/24 lewat R2: `ip route add 192.168.2.0/24 via 10.0.0.2`",
      check: (ctx) => ctx.net.device("r1").routes.some((r) => r.network === "192.168.2.0" && r.prefix === 24 && r.via === "10.0.0.2"),
    },
    { id: "half", text: "Ping PC-B lagi dari PC-A. Masih gagal?! Pikirkan: tahukah R2 jalan **pulang** ke 192.168.1.0/24?", requires: ["r1"], check: recent("ping:fail:pca>192.168.2.10") },
    {
      id: "r2",
      text: "Di **R2**, tambahkan rute balik ke 192.168.1.0/24 lewat 10.0.0.1",
      check: (ctx) => ctx.net.device("r2").routes.some((r) => r.network === "192.168.1.0" && r.prefix === 24 && r.via === "10.0.0.1"),
    },
    { id: "ok", text: "Ping PC-B dari PC-A — berhasil! 🎉", requires: ["r2"], check: recent("ping:ok:pca>192.168.2.10") },
    { id: "trace", text: "Lihat jalurnya dengan `traceroute 192.168.2.10` dari PC-A", requires: ["r2"], check: has("traceroute:ok:192.168.2.10") },
  ],
  hints: [
    "Router ditampilkan dengan prompt `root@r1:~#` — kamu sudah root, jadi tidak perlu sudo.",
    "Format: `ip route add <jaringan-tujuan>/<prefix> via <IP-router-berikutnya>`. Router berikutnya harus berada di jaringan yang terhubung langsung (10.0.0.0/30).",
    "Routing harus dua arah! Paket balasan dari PC-B ke PC-A juga harus tahu jalan pulang.",
  ],
};

export const natLab: LabDefinition = {
  id: "nat",
  title: "NAT: Satu IP Publik untuk Satu Rumah",
  summary: "Laptop dengan IP privat tidak bisa ke internet. Aktifkan NAT di router rumah dan lihat alamatnya diterjemahkan.",
  difficulty: "menengah",
  estimatedMinutes: 18,
  xp: 140,
  controllable: ["laptop", "router"],
  allowedCommands: [...NET_COMMANDS, "curl", "iptables", "conntrack"],
  briefing: [
    "Laptop di rumah memakai IP privat **192.168.1.10**. Router internet (ISP) **menolak** meneruskan paket ke alamat privat, karena alamat seperti itu dipakai jutaan rumah sekaligus.",
    "Router rumah punya satu IP publik dari ISP: **203.0.113.2**. Aktifkan **NAT (masquerade)** agar semua perangkat di rumah bisa ke internet dengan meminjam IP publik itu.",
  ],
  topology: {
    devices: [
      { id: "laptop", name: "Laptop", hostname: "laptop", kind: "laptop", position: { x: 0, y: 40 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], gateway: "192.168.1.1", hosts: { "netseclab.id": "198.51.100.80" } },
      { id: "hp", name: "HP", hostname: "hp", kind: "pc", position: { x: 0, y: 260 }, interfaces: [{ name: "eth0", ip: "192.168.1.11/24" }], gateway: "192.168.1.1", hosts: { "netseclab.id": "198.51.100.80" } },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 200, y: 150 } },
      {
        id: "router",
        name: "Router Rumah",
        hostname: "router-rumah",
        kind: "router",
        position: { x: 400, y: 150 },
        interfaces: [
          { name: "eth0", ip: "192.168.1.1/24" },
          { name: "eth1", ip: "203.0.113.2/24" },
        ],
        gateway: "203.0.113.1",
      },
      {
        id: "isp",
        name: "Internet (ISP)",
        hostname: "isp",
        kind: "internet",
        position: { x: 620, y: 150 },
        interfaces: [
          { name: "eth0", ip: "203.0.113.1/24" },
          { name: "eth1", ip: "198.51.100.1/24" },
        ],
      },
      {
        id: "web",
        name: "netseclab.id",
        hostname: "netseclab",
        kind: "server",
        position: { x: 840, y: 150 },
        interfaces: [{ name: "eth0", ip: "198.51.100.80/24" }],
        gateway: "198.51.100.1",
        web: {
          routes: {
            "/": (req) => ({
              body: `<h1>Halo dari netseclab.id!</h1>\n<p>Server ini melihat kamu datang dari IP: ${req.clientIp}</p>\n${req.clientIp.startsWith("192.168.") ? "" : "<p>Itu IP publik router rumahmu, bukan IP laptopmu. Itulah NAT!</p>\n"}`,
            }),
          },
        },
      },
    ],
    links: [
      ["laptop:eth0", "sw:p1"],
      ["hp:eth0", "sw:p2"],
      ["router:eth0", "sw:p3"],
      ["router:eth1", "isp:eth0"],
      ["isp:eth1", "web:eth0"],
    ],
  },
  objectives: [
    { id: "fail", text: "Dari **Laptop**, ping netseclab.id — gagal (*Request timeout*)", check: has("ping:fail:laptop>198.51.100.80") },
    { id: "ipa", text: "Pindah ke **Router Rumah**, lihat IP privat (eth0) dan IP publiknya (eth1) dengan `ip a`", check: has("ip:viewed:router") },
    {
      id: "masq",
      text: "Aktifkan NAT: `iptables -t nat -A POSTROUTING -o eth1 -j MASQUERADE`",
      check: (ctx) => ctx.net.device("router").nat.rules.some((r) => r.out === "eth1"),
    },
    { id: "ok", text: "Dari Laptop, ping netseclab.id lagi — berhasil!", requires: ["masq"], check: recent("ping:ok:laptop>198.51.100.80") },
    { id: "inspect", text: "Klik paket yang **keluar dari Router Rumah** ke ISP: alamat sumbernya sudah diganti (lihat kotak NAT 🔁)", check: has("ui:inspect:nat") },
    { id: "curl", text: "Buka website-nya: `curl http://netseclab.id` — IP siapa yang dilihat server?", requires: ["masq"], check: has("curl:ok:netseclab.id/") },
    { id: "conntrack", text: "Di router, lihat tabel translasi NAT: `conntrack -L`", requires: ["ok"], check: has("conntrack:listed") },
  ],
  hints: [
    "Perhatikan: ping gagal bukan karena paket tidak sampai ke server, tapi karena balasannya ditujukan ke 192.168.1.10 — dan ISP tidak tahu jalan ke alamat privat.",
    "`-o eth1` artinya: terjemahkan paket yang KELUAR lewat eth1 (sisi internet). MASQUERADE = pakai IP eth1 sebagai alamat sumber.",
    "HP di rumah yang sama juga akan keluar dengan IP 203.0.113.2. Router membedakan balasan untuk laptop dan HP lewat nomor port/ID di tabel NAT (`conntrack -L`).",
  ],
};
