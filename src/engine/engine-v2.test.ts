import { describe, expect, it } from "vitest";
import { buildNetwork, execute, type HopEvent, type Network, type ShellSession, type TopologySpec } from "@/engine";
import { parseForm, parseUrl } from "@/engine/protocols/http";

function session(net: Network, id: string): ShellSession {
  const device = net.device(id);
  return { device, cwd: device.fs?.home ?? "/", history: [] };
}

const text = (r: ReturnType<typeof execute>) =>
  r.events
    .filter((e) => e.kind === "output")
    .map((e) => (e as { text: string }).text)
    .join("\n")
    // strip ANSI colors
    .replace(/\x1b\[[0-9;]*m/g, "");

const hops = (r: ReturnType<typeof execute>) => r.events.filter((e): e is HopEvent => e.kind === "hop");

/** pc ── sw ── router(NAT) ── isp ── web ;  dns on the LAN, dhcp on the router. */
const world: TopologySpec = {
  devices: [
    { id: "pc", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], gateway: "192.168.1.1", dns: ["192.168.1.53"] },
    { id: "baru", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0" }] },
    {
      id: "dns",
      kind: "server",
      position: { x: 0, y: 0 },
      interfaces: [{ name: "eth0", ip: "192.168.1.53/24" }],
      gateway: "192.168.1.1",
      dnsServer: {
        records: [
          { name: "intranet.lab", type: "A", value: "192.168.1.53" },
          { name: "www.intranet.lab", type: "CNAME", value: "intranet.lab" },
        ],
        forwarder: "198.51.100.53",
      },
    },
    { id: "sw", kind: "switch", position: { x: 0, y: 0 } },
    { id: "sw2", kind: "switch", position: { x: 0, y: 0 } },
    {
      id: "r1",
      kind: "router",
      position: { x: 0, y: 0 },
      interfaces: [
        { name: "eth0", ip: "192.168.1.1/24" },
        { name: "eth1", ip: "203.0.113.2/24" },
      ],
      gateway: "203.0.113.1",
      nat: { outside: "eth1" },
      dhcpServer: { iface: "eth0", start: "192.168.1.100", end: "192.168.1.110", prefix: 24, gateway: "192.168.1.1", dns: ["192.168.1.53"] },
    },
    {
      id: "isp",
      kind: "router",
      position: { x: 0, y: 0 },
      interfaces: [
        { name: "eth0", ip: "203.0.113.1/24" },
        { name: "eth1", ip: "198.51.100.1/24" },
      ],
    },
    {
      id: "web",
      kind: "server",
      position: { x: 0, y: 0 },
      interfaces: [{ name: "eth0", ip: "198.51.100.80/24" }],
      gateway: "198.51.100.1",
      services: [{ port: 22, protocol: "tcp", name: "ssh", banner: "SSH-2.0-OpenSSH_9.6" }, { port: 3306, protocol: "tcp", name: "mysql", bind: "127.0.0.1" }],
      web: { https: true, routes: { "/": { body: "<h1>Halo</h1>\n" }, "/ip": (req) => ({ body: `IP kamu: ${req.clientIp}\n` }) } },
    },
    {
      id: "pubdns",
      kind: "server",
      position: { x: 0, y: 0 },
      interfaces: [{ name: "eth0", ip: "198.51.100.53/24" }],
      gateway: "198.51.100.1",
      dnsServer: { records: [{ name: "situs.id", type: "A", value: "198.51.100.80" }, { name: "situs.id", type: "MX", value: "mail.situs.id" }] },
    },
  ],
  links: [
    ["pc:eth0", "sw:p1"],
    ["baru:eth0", "sw:p2"],
    ["dns:eth0", "sw:p3"],
    ["r1:eth0", "sw:p4"],
    ["r1:eth1", "isp:eth0"],
    ["isp:eth1", "sw2:p1"],
    ["web:eth0", "sw2:p2"],
    ["pubdns:eth0", "sw2:p3"],
  ],
};

describe("NAT", () => {
  it("lets a private host reach the internet and hides its address", () => {
    const net = buildNetwork(world);
    const pc = session(net, "pc");
    const ping = execute(net, pc, "ping -c 1 198.51.100.80");
    expect(text(ping)).toContain("1 received");
    expect(hops(ping).some((h) => h.packet.note?.startsWith("NAT (masquerade)"))).toBe(true);
    // the web server only ever sees the router's public address
    const atWeb = hops(ping).filter((h) => h.to === "web" && h.packet.ip).map((h) => h.packet.ip?.src);
    expect(atWeb).toEqual(["203.0.113.2"]);
    expect(text(execute(net, pc, "curl http://198.51.100.80/ip"))).toContain("IP kamu: 203.0.113.2");
  });

  it("fails without masquerade because the ISP cannot route private addresses back", () => {
    const net = buildNetwork(world);
    net.device("r1").nat.rules = [];
    const r = execute(net, session(net, "pc"), "ping -c 1 198.51.100.80");
    expect(text(r)).toContain("0 received");
  });

  it("traceroute works through NAT", () => {
    const net = buildNetwork(world);
    const r = execute(net, session(net, "pc"), "traceroute 198.51.100.80");
    expect(text(r)).toMatch(/1 {2}192\.168\.1\.1/);
    expect(text(r)).toMatch(/2 {2}203\.0\.113\.1/);
    expect(r.facts).toContain("traceroute:ok:198.51.100.80");
  });
});

describe("TCP", () => {
  it("performs a 3-way handshake and graceful close", () => {
    const net = buildNetwork(world);
    const r = execute(net, session(net, "pc"), "nc -zv 198.51.100.80 22");
    expect(text(r)).toContain("succeeded");
    const flags = hops(r)
      .filter((h) => h.packet.tcp && h.to === "web")
      .map((h) => h.packet.tcp!.flags.join("+"));
    expect(flags).toEqual(["SYN", "ACK", "FIN+ACK", "ACK"]);
  });

  it("answers closed ports with RST and hides services bound to localhost", () => {
    const net = buildNetwork(world);
    const r = execute(net, session(net, "pc"), "nc -v 198.51.100.80 3306");
    expect(text(r)).toContain("Connection refused");
    expect(hops(r).some((h) => h.packet.tcp?.flags.includes("RST"))).toBe(true);
    expect(text(execute(net, session(net, "web"), "nc -zv 127.0.0.1 3306"))).toContain("succeeded");
  });

  it("shows service banners and listening sockets", () => {
    const net = buildNetwork(world);
    expect(text(execute(net, session(net, "pc"), "nc 198.51.100.80 22"))).toContain("SSH-2.0-OpenSSH_9.6");
    const ss = text(execute(net, session(net, "web"), "ss -tuln"));
    expect(ss).toContain("0.0.0.0:22");
    expect(ss).toContain("127.0.0.1:3306");
  });
});

describe("DNS", () => {
  it("resolves local names, CNAMEs and forwards unknown names upstream", () => {
    const net = buildNetwork(world);
    const pc = session(net, "pc");
    expect(text(execute(net, pc, "nslookup www.intranet.lab"))).toContain("192.168.1.53");
    const fwd = execute(net, pc, "dig situs.id");
    expect(text(fwd)).toContain("198.51.100.80");
    expect(hops(fwd).some((h) => h.to === "pubdns" && h.packet.app?.protocol === "DNS")).toBe(true);
    expect(text(execute(net, pc, "dig situs.id MX +short"))).toContain("mail.situs.id");
    expect(text(execute(net, pc, "nslookup tidakada.lab"))).toContain("NXDOMAIN");
  });

  it("supports record types in nslookup and host", () => {
    const net = buildNetwork(world);
    const pc = session(net, "pc");
    expect(text(execute(net, pc, "nslookup -type=MX situs.id"))).toContain("mail exchanger = 10 mail.situs.id.");
    expect(text(execute(net, pc, "host -t MX situs.id"))).toContain("mail is handled by 10 mail.situs.id.");
    const noA = text(execute(net, pc, "nslookup -type=TXT situs.id"));
    expect(noA).toContain("No answer");
    expect(noA).not.toContain("NXDOMAIN");
  });

  it("uses DNS transparently for ping and curl", () => {
    const net = buildNetwork(world);
    const r = execute(net, session(net, "pc"), "curl http://situs.id/");
    expect(text(r)).toContain("<h1>Halo</h1>");
    expect(r.facts).toContain("dns:resolved:situs.id");
  });

  it("requires sudo tee to change resolv.conf", () => {
    const net = buildNetwork(world);
    const pc = session(net, "pc");
    expect(text(execute(net, pc, "echo nameserver 10.9.9.9 > /etc/resolv.conf"))).toContain("Permission denied");
    expect(text(execute(net, pc, "echo nameserver 10.9.9.9 | tee /etc/resolv.conf"))).toContain("Permission denied");
    execute(net, pc, "echo nameserver 10.9.9.9 | sudo tee /etc/resolv.conf");
    expect(text(execute(net, pc, "ping -c 1 situs.id"))).toContain("Temporary failure in name resolution");
  });
});

describe("DHCP", () => {
  it("leases an address with gateway and DNS via DORA", () => {
    const net = buildNetwork(world);
    const baru = session(net, "baru");
    expect(text(execute(net, baru, "dhclient eth0"))).toContain("Operation not permitted");
    const r = execute(net, baru, "sudo dhclient -v eth0");
    expect(text(r)).toContain("DHCPACK of 192.168.1.100 from 192.168.1.1");
    const summaries = hops(r).filter((h) => h.packet.app?.protocol === "DHCP").map((h) => h.packet.app!.summary.split(" ")[1]);
    expect([...new Set(summaries)]).toEqual(["Discover", "Offer", "Request", "ACK"]);
    expect(net.device("baru").interfaces[0].ip).toBe("192.168.1.100");
    expect(execute(net, baru, "ping -c 1 situs.id").facts).toContain("ping:ok:198.51.100.80");
  });
});

describe("HTTP(S)", () => {
  it("sends credentials in plaintext over HTTP but encrypts them over HTTPS", () => {
    const net = buildNetwork(world);
    const pc = session(net, "pc");
    const plain = execute(net, pc, 'curl -d "user=a&pass=rahasia" http://situs.id/');
    expect(hops(plain).some((h) => h.packet.app?.protocol === "HTTP" && h.packet.app.data?.includes("pass=rahasia"))).toBe(true);
    const secure = execute(net, pc, 'curl -d "user=a&pass=rahasia" https://situs.id/');
    expect(hops(secure).some((h) => h.packet.app?.data?.includes("rahasia"))).toBe(false);
    expect(hops(secure).some((h) => h.packet.app?.protocol === "TLS")).toBe(true);
    expect(secure.facts).toContain("curl:post:https:situs.id/");
  });

  it("reports 404 and connection errors like curl", () => {
    const net = buildNetwork(world);
    const pc = session(net, "pc");
    expect(text(execute(net, pc, "curl -I http://situs.id/nope"))).toContain("HTTP/1.1 404 Not Found");
    expect(text(execute(net, pc, "curl http://192.168.1.53/"))).toContain("Connection refused");
    expect(text(execute(net, pc, "curl http://nama-asal.lab/"))).toContain("Could not resolve host");
  });

  it("keeps '=' inside form and query values", () => {
    expect(parseForm("pesan=<img src=x onerror=alert(1)>&a=1")).toEqual({ pesan: "<img src=x onerror=alert(1)>", a: "1" });
    expect(parseUrl("http://x.lab/cari?q=' OR '1'='1")?.query.q).toBe("' OR '1'='1");
  });
});

describe("VLAN", () => {
  const vlanNet: TopologySpec = {
    devices: [
      { id: "a", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.1/24" }] },
      { id: "b", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.2/24" }] },
      { id: "c", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.3/24" }] },
      { id: "sw1", kind: "switch", position: { x: 0, y: 0 }, ports: { p8: { trunk: true } } },
      { id: "sw2", kind: "switch", position: { x: 0, y: 0 }, ports: { p8: { trunk: true } } },
    ],
    links: [
      ["a:eth0", "sw1:p1"],
      ["b:eth0", "sw1:p2"],
      ["c:eth0", "sw2:p1"],
      ["sw1:p8", "sw2:p8"],
    ],
  };

  it("isolates VLANs and tags frames on trunks", () => {
    const net = buildNetwork(vlanNet);
    const sw1 = session(net, "sw1");
    const sw2 = session(net, "sw2");
    expect(execute(net, session(net, "a"), "ping -c 1 10.0.0.2").facts).toContain("ping:ok:10.0.0.2");
    execute(net, sw1, "switchport p2 vlan 20");
    execute(net, sw2, "switchport p1 vlan 20");
    expect(execute(net, session(net, "a"), "ping -c 1 10.0.0.3").facts).toContain("ping:fail:10.0.0.3");
    const r = execute(net, session(net, "b"), "ping -c 1 10.0.0.3");
    expect(r.facts).toContain("ping:ok:10.0.0.3");
    expect(hops(r).some((h) => h.packet.eth?.vlan === 20)).toBe(true);
    expect(text(execute(net, sw1, "show vlan"))).toMatch(/20\s+VLAN0020/);
    expect(text(execute(net, session(net, "a"), "show vlan"))).toContain("hanya tersedia di switch");
  });
});

describe("routing errors", () => {
  it("routers report Destination Net Unreachable", () => {
    const net = buildNetwork(world);
    const r = execute(net, session(net, "pc"), "ping -c 1 172.31.0.1");
    // r1's default route sends it to the ISP router, which has no route
    expect(text(r)).toContain("From 203.0.113.1 icmp_seq=1 Destination Net Unreachable");
  });
});
