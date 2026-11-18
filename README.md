# NetSec Lab

Web belajar **jaringan komputer & cyber security dari nol** (Bahasa Indonesia) dengan **lab interaktif**: ketik perintah di terminal (kiri) dan lihat paket bergerak di peta jaringan (kanan). Semua jaringan disimulasikan di browser — aman, tanpa VM/container.

![Ilustrasi workspace NetSec Lab: terminal simulasi dan peta jaringan](docs/screenshot.png)

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit test engine, lab, dan konten (Vitest)
npm run lint
npm run build
```

## Struktur

```
src/
├─ app/
│  ├─ (site)/                 # halaman dengan header/footer
│  │  ├─ page.tsx             # landing
│  │  ├─ learn/               # kurikulum, modul, materi (MDX)
│  │  ├─ lab/                 # daftar lab
│  │  ├─ dashboard/           # XP, level, progres
│  │  └─ tools/subnet/        # kalkulator subnet
│  └─ (workspace)/lab/[labId] # workspace lab layar penuh
├─ engine/                    # simulation engine (TypeScript murni, tanpa React)
│  ├─ core/                   # Network, Device, Packet, IP utils, L2/L3 forwarding
│  ├─ protocols/              # ICMP (ping/traceroute)
│  ├─ shell/                  # shell Linux tersimulasi, file system virtual, perintah
│  ├─ topology.ts             # membangun Network dari spesifikasi topologi
│  └─ lab.ts                  # tipe definisi lab & objektif
├─ content/
│  ├─ curriculum.ts           # 16 modul & daftar materi
│  ├─ lessons/<modul>/*.mdx   # isi materi
│  ├─ lesson-content.ts       # peta materi → komponen MDX
│  └─ labs/                   # definisi lab (topologi, objektif, petunjuk)
├─ components/
│  ├─ lab/                    # terminal (xterm.js), peta (React Flow), inspektor paket
│  ├─ learn/                  # komponen MDX: Quiz, Callout, OSI, kalkulator subnet, dll.
│  └─ progress/               # widget progres & dashboard
└─ store/                     # Zustand: state lab & progres (localStorage)
```

## Cara kerja simulasi

1. `execute()` di `engine/shell/shell.ts` mem-parse perintah (mendukung `|`, `>`, `>>`, `&&`, `;`, `sudo`).
2. Perintah jaringan memanggil engine (`Network.sendIp`, ARP, switching, routing, TTL) yang menghasilkan **timeline** event: `hop` (paket melintasi link) dan `output` (teks terminal).
3. `store/lab-store.ts` memutar timeline sesuai kecepatan (0.25×–2× / instan): teks ditulis ke terminal, paket dianimasikan di peta, dan dicatat di panel Paket.
4. Setiap perintah juga menghasilkan *facts* (mis. `ping:ok:10.0.0.5`) yang dipakai objektif lab untuk pengecekan otomatis.

## Menambah konten

- **Materi baru**: tambahkan entri di `content/curriculum.ts`, buat file `content/lessons/<modul>/<slug>.mdx`, lalu daftarkan di `content/lesson-content.ts`.
- **Lab baru**: buat `LabDefinition` di `content/labs/`, daftarkan di `content/labs/index.ts`, dan tambahkan solusi referensinya di `content/labs/labs.test.ts`.

## Status

- ✅ Fondasi, lab UI (terminal xterm.js + peta React Flow + inspektor paket + panel perangkat)
- ✅ Engine v1: ARP, hub/switch (MAC learning), routing (longest prefix match), TTL, ICMP, shell Linux
- ✅ Engine v2: VLAN & trunk 802.1Q, NAT masquerade (`iptables`, `conntrack`), ICMP error dari router (`!N`/`!H`),
  TCP (handshake, data, FIN, RST), UDP, DNS (resolver, CNAME/MX/TXT, forwarder), DHCP (DORA), HTTP/HTTPS (TLS),
  perintah `nslookup`, `dig`, `host`, `curl`, `nc`, `ss`/`netstat`, `dhclient`, `tee`, CLI switch (`show`, `switchport`)
- ✅ Engine keamanan: firewall `iptables` (INPUT/FORWARD/OUTPUT, policy, ACCEPT/DROP/REJECT/LOG, connection tracking,
  penghitung paket), `nmap` (-sn/-sS/-sT/-sU/-sV/-O/-p-), `tcpdump` (filter & -A, menangkap lalu lintas latar belakang lab),
  hash `md5sum`/`sha256sum`/`base64`, `john` (dictionary attack terhadap hash), deteksi ARP spoofing (`arp -s` statis)
- ✅ Playback animasi memakai satu loop `requestAnimationFrame` (scan /24 dengan >1000 paket tetap lancar)
- ✅ Web security: mini SQL engine (SELECT, WHERE, LIKE, UNION, `information_schema`, prepared statement `?`) di
  `engine/webapp/`, aplikasi rentan `toko.lab` (SQLi) & `forum.lab` (XSS) dengan versi aman `/v2`, log query di panel
  perangkat, perintah `browser` + tab Browser (iframe sandbox + CSP, skrip tidak pernah dijalankan)
- ✅ CTF Mini: 6 tantangan, `submit-flag` (flag disimpan sebagai hash SHA-256)
- ✅ Modul 0–15 lengkap (44 materi, 28 lab, kuis, diagram urutan interaktif)
- ⏳ Berikutnya: login & database (Supabase) untuk sinkronisasi progres & leaderboard, SSH interaktif
