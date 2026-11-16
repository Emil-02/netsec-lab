import { describe, expect, it } from "vitest";
import { buildNetwork, execute, subnetInfo, type HopEvent, type ShellSession, type TopologySpec } from "@/engine";

const lan: TopologySpec = {
  devices: [
    { id: "pc1", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }], gateway: "192.168.1.1" },
    { id: "pc2", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "192.168.1.20/24" }] },
    { id: "sw1", kind: "switch", position: { x: 0, y: 0 } },
    {
      id: "r1",
      kind: "router",
      position: { x: 0, y: 0 },
      interfaces: [
        { name: "eth0", ip: "192.168.1.1/24" },
        { name: "eth1", ip: "10.0.0.1/24" },
      ],
    },
    { id: "srv", kind: "server", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.5/24" }], gateway: "10.0.0.1", hosts: {} },
  ],
  links: [
    ["pc1:eth0", "sw1:p1"],
    ["pc2:eth0", "sw1:p2"],
    ["r1:eth0", "sw1:p3"],
    ["r1:eth1", "srv:eth0"],
  ],
};

function session(net: ReturnType<typeof buildNetwork>, id: string): ShellSession {
  const device = net.device(id);
  return { device, cwd: device.fs!.home, history: [] };
}

const outputText = (events: ReturnType<typeof execute>["events"]) =>
  events.filter((e) => e.kind === "output").map((e) => (e as { text: string }).text).join("\n");

describe("ip utils", () => {
  it("computes subnet info", () => {
    const info = subnetInfo("192.168.10.77", 26);
    expect(info.network).toBe("192.168.10.64");
    expect(info.broadcast).toBe("192.168.10.127");
    expect(info.usableHosts).toBe(62);
    expect(info.mask).toBe("255.255.255.192");
  });
});

describe("network simulation", () => {
  it("pings a host on the same LAN using ARP first", () => {
    const net = buildNetwork(lan);
    const res = execute(net, session(net, "pc1"), "ping -c 2 192.168.1.20");
    expect(res.facts).toContain("ping:ok:192.168.1.20");
    const hops = res.events.filter((e): e is HopEvent => e.kind === "hop");
    expect(hops[0].packet.arp?.op).toBe("request");
    // ARP request is flooded by the switch to pc2 and r1
    expect(hops.filter((h) => h.packet.arp?.op === "request")).toHaveLength(3);
    expect(net.device("pc1").arp.get("192.168.1.20")).toBeTruthy();
    expect(net.device("pc2").arp.get("192.168.1.10")).toBeTruthy();
    expect(outputText(res.events)).toContain("2 packets transmitted, 2 received");
  });

  it("routes through the gateway and decrements TTL", () => {
    const net = buildNetwork(lan);
    const res = execute(net, session(net, "pc1"), "ping -c 1 10.0.0.5");
    expect(res.facts).toContain("ping:ok:10.0.0.5");
    expect(outputText(res.events)).toContain("ttl=63");
  });

  it("traceroute lists the router then the destination", () => {
    const net = buildNetwork(lan);
    const res = execute(net, session(net, "pc1"), "traceroute 10.0.0.5");
    const text = outputText(res.events);
    expect(text).toMatch(/1 {2}.*192\.168\.1\.1/);
    expect(text).toMatch(/2 {2}.*10\.0\.0\.5/);
    expect(res.facts).toContain("traceroute:ok:10.0.0.5");
  });

  it("fails without a gateway and succeeds after configuring one with sudo", () => {
    const net = buildNetwork(lan);
    const pc2 = session(net, "pc2");
    expect(outputText(execute(net, pc2, "ping -c 1 10.0.0.5").events)).toContain("Network is unreachable");
    expect(outputText(execute(net, pc2, "ip route add default via 192.168.1.1").events)).toContain("Operation not permitted");
    execute(net, pc2, "sudo ip route add default via 192.168.1.1");
    expect(execute(net, pc2, "ping -c 1 10.0.0.5").facts).toContain("ping:ok:10.0.0.5");
  });

  it("reports host unreachable when ARP gets no answer", () => {
    const net = buildNetwork(lan);
    const res = execute(net, session(net, "pc1"), "ping -c 1 192.168.1.99");
    expect(outputText(res.events)).toContain("Destination Host Unreachable");
  });
});

describe("shell", () => {
  it("supports files, redirects and pipes", () => {
    const net = buildNetwork(lan);
    const s = session(net, "pc1");
    execute(net, s, "mkdir lab && cd lab");
    expect(s.cwd).toBe("/home/siswa/lab");
    execute(net, s, 'echo "halo dunia" > catatan.txt');
    execute(net, s, "echo baris dua >> catatan.txt");
    expect(outputText(execute(net, s, "cat catatan.txt | grep dua").events)).toBe("baris dua");
    expect(outputText(execute(net, s, "ls").events)).toContain("catatan.txt");
    expect(outputText(execute(net, s, "foo").events)).toContain("perintah tidak ditemukan");
  });
});
