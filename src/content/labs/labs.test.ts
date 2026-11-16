import { describe, expect, it } from "vitest";
import { buildNetwork, commandNames, evaluateObjectives, execute, type LabContext, type LabDefinition, type ShellSession } from "@/engine";
import { CTF_FLAGS_FOR_TESTS } from "./ctf";
import { labList } from "./index";

/** Reference solutions: [deviceId, command][] plus UI facts the learner would trigger. */
const solutions: Record<string, { steps: Step[]; uiFacts?: string[] }> = {
  "tur-lab": {
    steps: [["laptop", "help"], ["laptop", "whoami"], ["laptop", "ip a"], ["laptop", "ping teman"], ["laptop", "ping -c 1 printer"], ["laptop", "arp -a"]],
    uiFacts: ["ui:packet-inspected"],
  },
  "linux-navigasi": {
    steps: [["pc", "pwd"], ["pc", "ls"], ["pc", "cd dokumen/rahasia"], ["pc", "ls -a"], ["pc", "cat .pesan-admin"], ["pc", "cd"]],
  },
  "linux-file": {
    steps: [
      ["pc", "mkdir latihan"],
      ["pc", 'echo "Halo dunia" > latihan/halo.txt'],
      ["pc", "cp latihan/halo.txt latihan/halo-backup.txt"],
      ["pc", "mv laporan-lama.txt latihan/laporan-q1.txt"],
      ["pc", "rm sampah.txt"],
    ],
  },
  "linux-permission": {
    steps: [["pc", "whoami"], ["pc", "ls -l skrip"], ["pc", "chmod 755 skrip/backup.sh"], ["pc", "cat /var/log/keamanan.log"], ["pc", "sudo cat /var/log/keamanan.log"]],
  },
  "linux-log-hunt": {
    steps: [["pc", "cat /var/log/auth.log"], ["pc", "grep Failed /var/log/auth.log | wc -l"], ["pc", "echo 203.0.113.45 > ~/laporan.txt"]],
  },
  "hub-vs-switch": {
    steps: [["a1", "ping -c 2 10.0.0.3"], ["b1", "ping -c 2 10.0.1.3"]],
    uiFacts: ["ui:device:swB", "ui:device:hubA"],
  },
  enkapsulasi: {
    steps: [["pc", "ping -c 1 server"], ["pc", "traceroute server"]],
    uiFacts: ["ui:packet-inspected", "ui:compared-hops"],
  },
  "konfigurasi-ip": {
    steps: [
      ["baru", "ip a"],
      ["baru", "sudo ip addr add 192.168.10.50/24 dev eth0"],
      ["baru", "ping -c 1 192.168.10.20"],
      ["baru", "sudo ip route add default via 192.168.10.1"],
      ["baru", "ping -c 1 172.16.0.10"],
    ],
  },
  arp: {
    steps: [
      ["laptop", "ip neigh"],
      ["laptop", "ping -c 1 192.168.1.20"],
      { ui: ["ui:inspect:arp-request", "ui:inspect:arp-reply"] },
      ["laptop", "ping -c 1 10.0.0.5"],
      ["laptop", "sudo ip neigh flush all"],
      ["laptop", "ping -c 1 192.168.1.20"],
    ],
  },
  "mac-table": {
    steps: [
      ["sw", "show mac address-table"],
      ["pc1", "ping -c 1 192.168.5.12"],
      ["pc1", "ping -c 1 192.168.5.13"],
      ["pc1", "ping -c 1 192.168.5.14"],
      ["sw", "clear mac address-table"],
      ["pc1", "ping -c 1 192.168.5.12"],
    ],
  },
  vlan: {
    steps: [
      ["staf1", "ping -c 1 10.0.0.21"],
      ["sw1", "show vlan"],
      ["sw1", "switchport p3 vlan 20"],
      ["sw2", "switchport p1 vlan 20"],
      ["staf1", "ping -c 1 10.0.0.21"],
      ["hrd1", "ping -c 1 10.0.0.22"],
      { ui: ["ui:inspect:vlan-tag"] },
    ],
  },
  "static-route": {
    steps: [
      ["pca", "ping -c 1 192.168.2.10"],
      ["r1", "ip route"],
      ["r1", "ip route add 192.168.2.0/24 via 10.0.0.2"],
      ["pca", "ping -c 1 192.168.2.10"],
      ["r2", "ip route add 192.168.1.0/24 via 10.0.0.1"],
      ["pca", "ping -c 1 192.168.2.10"],
      ["pca", "traceroute 192.168.2.10"],
    ],
  },
  nat: {
    steps: [
      ["laptop", "ping -c 1 netseclab.id"],
      ["router", "ip a"],
      ["router", "iptables -t nat -A POSTROUTING -o eth1 -j MASQUERADE"],
      ["laptop", "ping -c 1 netseclab.id"],
      { ui: ["ui:inspect:nat"] },
      ["laptop", "curl http://netseclab.id"],
      ["router", "conntrack -L"],
    ],
  },
  "port-layanan": {
    steps: [
      ["srv", "ss -tuln"],
      ["pc", "nc -zv srv 22"],
      ["pc", "nc srv 22"],
      ["pc", "nc -zv srv 23"],
      ["pc", "nc -zv srv 3306"],
      ["pc", "nc -zv srv 20-30"],
    ],
  },
  "tcp-handshake": {
    steps: [
      ["pc", "curl http://web.lab"],
      { ui: ["ui:inspect:tcp:SYN", "ui:inspect:tcp:SYN+ACK", "ui:inspect:HTTP", "ui:inspect:tcp:FIN+ACK"] },
      ["pc", "nc -v web.lab 8080"],
      { ui: ["ui:inspect:tcp:RST+ACK"] },
    ],
  },
  dns: {
    steps: [
      ["pc", "ping -c 1 web.kantor.lab"],
      ["pc", "ping -c 1 10.0.0.80"],
      ["pc", "cat /etc/resolv.conf"],
      ["pc", "nslookup web.kantor.lab 10.0.0.53"],
      ["pc", 'echo "nameserver 10.0.0.53" | sudo tee /etc/resolv.conf'],
      ["pc", "curl http://intranet.kantor.lab"],
      ["pc", "dig netseclab.id"],
      ["pc", "dig kantor.lab MX"],
    ],
  },
  dhcp: {
    steps: [
      ["laptop", "ip a"],
      ["laptop", "ping -c 1 192.168.1.1"],
      ["laptop", "sudo dhclient -v eth0"],
      { ui: ["ui:inspect:DHCP"] },
      ["laptop", "ip route"],
      ["laptop", "cat /etc/resolv.conf"],
      ["laptop", "curl http://printer.lan"],
    ],
  },
  http: {
    steps: [
      ["pc", "curl http://toko.lab"],
      ["pc", "curl -I http://toko.lab"],
      ["pc", "curl http://toko.lab/tidak-ada"],
      ["pc", "curl -L http://toko.lab/lama"],
      ["pc", "curl http://toko.lab/robots.txt"],
      ["pc", "curl http://toko.lab/cadangan-lama"],
      ["pc", 'curl -d "user=siswa&pass=netsec123" http://toko.lab/login'],
      { ui: ["ui:inspect:http-password"] },
      ["pc", 'curl -d "user=siswa&pass=netsec123" https://toko.lab/login'],
      { ui: ["ui:inspect:tls-data"] },
    ],
  },
  "kripto-dasar": {
    steps: [
      ["pc", "base64 -d pesan.txt"],
      ["pc", "echo -n halo | sha256sum"],
      ["pc", "echo -n Halo | sha256sum"],
      ["pc", "sha256sum unduhan/aplikasi-kasir.sh unduhan/driver-printer.sh"],
      ["pc", "cat unduhan/SHA256SUMS"],
      ["pc", "echo driver-printer.sh > ~/laporan.txt"],
    ],
  },
  "nmap-recon": {
    steps: [
      ["kali", "sudo nmap -sn 10.10.10.0/24"],
      ["kali", "sudo nmap 10.10.10.10"],
      ["kali", "sudo nmap -sV 10.10.10.20"],
      ["kali", "sudo nmap -O 10.10.10.30"],
      ["kali", "sudo nmap 10.10.10.40"],
      ["kali", "sudo nmap -p- 10.10.10.40"],
      ["kali", "curl http://10.10.10.40:31337/"],
    ],
  },
  sniffing: {
    steps: [
      ["auditor", "sudo tcpdump"],
      ["auditor", "sudo tcpdump -A tcp port 80"],
      ["auditor", "echo 'akun budi bocor lewat HTTP' > ~/temuan.txt"],
      { ui: ["ui:inspect:tls-data"] },
    ],
  },
  "deteksi-arp-spoofing": {
    steps: [
      ["pc", "traceroute web.lab"],
      ["pc", "ping -c 1 192.168.1.66"],
      ["pc", "arp -a"],
      { ui: ["ui:device:r1"] },
      ["pc", "sudo arp -s 192.168.1.1 02:42:ac:04:00:25"],
      ["pc", "traceroute web.lab"],
    ],
  },
  "audit-password": {
    steps: [
      ["pc", "cat bocoran/users.txt"],
      ["pc", "echo -n sayang123 | md5sum"],
      ["pc", "john --format=raw-md5 --wordlist=/usr/share/wordlists/umum.txt bocoran/users.txt"],
      ["pc", "john --show bocoran/users.txt"],
      ["pc", "echo budi > ~/wajib-ganti.txt"],
      ["pc", "echo sari >> ~/wajib-ganti.txt"],
      ["pc", "echo admin >> ~/wajib-ganti.txt"],
      ["pc", "echo dodi >> ~/wajib-ganti.txt"],
    ],
  },
  "firewall-server": {
    steps: [
      ["luar", "sudo nmap 10.0.0.20"],
      ["srv", "iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT"],
      ["srv", "iptables -A INPUT -p tcp --dport 80 -j ACCEPT"],
      ["srv", "iptables -A INPUT -p tcp --dport 22 -s 10.0.0.5 -j ACCEPT"],
      ["srv", "iptables -P INPUT DROP"],
      ["luar", "sudo nmap 10.0.0.20"],
      ["admin", "nc -zv 10.0.0.20 22"],
      ["srv", "iptables -L -n -v"],
    ],
  },
  "respons-insiden": {
    steps: [
      ["srv", "grep Failed /var/log/auth.log | wc -l"],
      ["srv", "grep Failed /var/log/auth.log | tail"],
      ["penyerang", "nc -zv 10.0.0.20 22"],
      ["srv", "iptables -A INPUT -s 203.0.113.66 -j DROP"],
      ["srv", 'iptables -I INPUT 1 -s 203.0.113.66 -j LOG --log-prefix "DIBLOKIR: "'],
      ["penyerang", "nc -zv 10.0.0.20 22"],
      ["srv", "cat /var/log/kern.log"],
    ],
  },
  "sql-injection": {
    steps: [
      ["laptop", 'browser "http://toko.lab/cari?q=kabel"'],
      ["laptop", `browser "http://toko.lab/cari?q='"`],
      ["laptop", `curl -d "user=admin' -- &pass=bebas" http://toko.lab/login`],
      ["laptop", `browser "http://toko.lab/cari?q=x' UNION SELECT table_name, table_schema FROM information_schema.tables -- "`],
      ["laptop", `browser "http://toko.lab/cari?q=x' UNION SELECT catatan, 1 FROM rahasia_admin -- "`],
      ["laptop", `curl -d "user=admin' -- &pass=bebas" http://toko.lab/v2/login`],
    ],
  },
  xss: {
    steps: [
      ["laptop", "browser http://forum.lab/buku-tamu"],
      ["laptop", 'browser "http://forum.lab/cari?q=<b>tebal</b>"'],
      ["laptop", 'browser "http://forum.lab/cari?q=<script>alert(1)</script>"'],
      ["laptop", 'curl -d "nama=Iseng&pesan=<script>alert(1)</script>" http://forum.lab/buku-tamu'],
      ["laptop", "browser http://forum.lab/buku-tamu"],
      ["laptop", 'curl -d "nama=Iseng&pesan=<script>alert(1)</script>" http://forum.lab/v2/buku-tamu'],
      ["laptop", "browser http://forum.lab/v2/buku-tamu"],
    ],
  },
  "ctf-mini": {
    steps: [
      ["kali", "cat README.txt"],
      ["kali", `submit-flag ${CTF_FLAGS_FOR_TESTS.pemanasan}`],
      ["kali", "dig ctf.lab TXT +short"],
      ["kali", `submit-flag ${CTF_FLAGS_FOR_TESTS.dns}`],
      ["kali", "curl http://portal.ctf.lab/robots.txt"],
      ["kali", `submit-flag ${CTF_FLAGS_FOR_TESTS.robots}`],
      ["kali", "sudo nmap -p- files.ctf.lab"],
      ["kali", "nc files.ctf.lab 8888"],
      ["kali", `submit-flag ${CTF_FLAGS_FOR_TESTS.port}`],
      ["kali", "john --format=raw-md5 --wordlist=/usr/share/wordlists/umum.txt bocoran/hash.txt"],
      ["kali", `submit-flag ${CTF_FLAGS_FOR_TESTS.hash}`],
      ["kali", `curl -d "user=admin' -- &pass=x" http://portal.ctf.lab/login`],
      ["kali", `submit-flag ${CTF_FLAGS_FOR_TESTS.sqli}`],
    ],
  },
};

export type Step = [deviceId: string, command: string] | { ui: string[] };

export function runSolution(lab: LabDefinition, steps: Step[]) {
  const net = buildNetwork(lab.topology);
  const sessions = new Map<string, ShellSession>();
  const facts = new Set<string>();
  let done: string[] = [];
  for (const step of steps) {
    let recent: string[];
    if (Array.isArray(step)) {
      const [deviceId, cmd] = step;
      if (!sessions.has(deviceId)) {
        const device = net.device(deviceId);
        sessions.set(deviceId, { device, cwd: device.fs?.home ?? "/", history: [] });
      }
      recent = execute(net, sessions.get(deviceId)!, cmd, { allowedCommands: lab.allowedCommands, background: lab.background, flags: lab.flags }).facts;
    } else {
      recent = step.ui;
    }
    recent.forEach((f) => facts.add(f));
    done = evaluateObjectives(lab.objectives, { net, facts, recent: new Set(recent) }, done);
  }
  return { net, facts, done };
}

describe("lab definitions", () => {
  for (const lab of labList) {
    it(`${lab.id} can be completed with its reference solution`, () => {
      const solution = solutions[lab.id];
      expect(solution, `missing solution for ${lab.id}`).toBeDefined();
      const steps: Step[] = [...solution.steps, ...(solution.uiFacts ? [{ ui: solution.uiFacts }] : [])];
      const { done } = runSolution(lab, steps);
      expect(lab.objectives.map((o) => o.id).filter((id) => !done.includes(id))).toEqual([]);
    });

    it(`${lab.id} starts with no objective completed`, () => {
      const ctx: LabContext = { net: buildNetwork(lab.topology), facts: new Set(), recent: new Set() };
      expect(evaluateObjectives(lab.objectives, ctx, [])).toEqual([]);
    });

    it(`${lab.id} only unlocks allowed commands that exist`, () => {
      const missing = (lab.allowedCommands ?? []).filter((c) => !commandNames().includes(c));
      expect(missing).toEqual([]);
    });
  }
});
