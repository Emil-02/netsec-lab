"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PROTOCOL_COLORS, packetProtocol, type Device } from "@/engine";
import { deviceColors, deviceIcons } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ActiveHop } from "@/store/lab-store";
import { useLab, useLabStore } from "./lab-context";

type DeviceNodeData = {
  device: Device;
  active: boolean;
  selected: boolean;
  version: number;
};
type DeviceNodeType = Node<DeviceNodeData, "device">;
type LinkEdgeData = { aIface: string; bIface: string };
type LinkEdgeType = Edge<LinkEdgeData, "link">;

const ICON_BOX = 52;

function deviceRoles(device: Device): string[] {
  const roles: string[] = [];
  const has = (port: number) => device.services.some((s) => s.port === port && (!s.bind || !s.bind.startsWith("127.")));
  if (has(80) || has(443)) roles.push(has(443) ? "WEB·HTTPS" : "WEB");
  if (device.dns) roles.push("DNS");
  if (device.dhcp) roles.push("DHCP");
  if (has(22)) roles.push("SSH");
  if (device.nat.rules.length) roles.push("NAT");
  return roles;
}

function DeviceNode({ data }: NodeProps<DeviceNodeType>) {
  const { device, active, selected } = data;
  const Icon = deviceIcons[device.kind];
  const color = deviceColors[device.kind];
  const ips = device.interfaces.filter((i) => i.ip).map((i) => `${i.ip}/${i.prefix}`);
  const isL2 = device.kind === "switch" || device.kind === "hub";
  const roles = deviceRoles(device);
  const handleStyle = { top: ICON_BOX / 2, left: "50%", width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0, border: 0, transform: "translate(-50%, -50%)" };
  return (
    <div className="flex w-[130px] cursor-pointer flex-col items-center text-center">
      <Handle type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={handleStyle} isConnectable={false} />
      <div
        className={cn(
          "relative grid place-items-center rounded-2xl border-2 bg-surface shadow-lg transition-all",
          selected ? "ring-4 ring-white/20" : "",
        )}
        style={{ width: ICON_BOX, height: ICON_BOX, borderColor: color, boxShadow: active ? `0 0 24px ${color}66` : undefined }}
      >
        <Icon className="size-6" style={{ color }} />
        {active && (
          <span className="absolute -top-2 -right-2 rounded-full bg-accent px-1.5 text-[9px] font-bold text-slate-950">KAMU</span>
        )}
      </div>
      <div className="mt-1.5 text-xs font-semibold text-slate-100">{device.name}</div>
      {ips.map((ip) => (
        <div key={ip} className="font-mono text-[10px] leading-tight text-muted">
          {ip}
        </div>
      ))}
      {!isL2 && !ips.length && <div className="font-mono text-[10px] text-red-300">tanpa IP</div>}
      {roles.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-center gap-0.5">
          {roles.map((r) => (
            <span key={r} className="rounded bg-surface-2 px-1 text-[8px] font-bold tracking-wide text-slate-300">
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PacketDot({ hop, x1, y1, x2, y2, reverse }: { hop: ActiveHop; x1: number; y1: number; x2: number; y2: number; reverse: boolean }) {
  const ref = useRef<SVGGElement>(null);
  const store = useLabStore();
  const color = PROTOCOL_COLORS[packetProtocol(hop.event.packet)];
  const label = packetProtocol(hop.event.packet);

  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    const stops = hop.event.ignored || hop.event.dropped ? 0.82 : 1;
    const at = (p: number) => {
      const t = reverse ? 1 - p : p;
      return `translate(${x1 + (x2 - x1) * t}px, ${y1 + (y2 - y1) * t}px)`;
    };
    const animation = g.animate(
      [
        { transform: at(0), opacity: 1, offset: 0 },
        { transform: at(stops), opacity: 1, offset: 0.92 },
        { transform: at(stops), opacity: stops < 1 ? 0.25 : 1, offset: 1 },
      ],
      { duration: hop.duration, fill: "forwards", easing: "linear" },
    );
    animation.currentTime = Math.min(hop.duration, Math.max(0, performance.now() - hop.start));
    return () => animation.cancel();
  }, [hop, x1, y1, x2, y2, reverse]);

  return (
    <g
      ref={ref}
      className="cursor-pointer"
      style={{ pointerEvents: "all" }}
      onClick={(e) => {
        e.stopPropagation();
        const state = store.getState();
        const logged = state.packetLog.find((p) => p.event.id === hop.event.id);
        if (logged) state.selectPacket(logged.no);
      }}
    >
      <circle r={9} fill={color} fillOpacity={hop.event.ignored ? 0.35 : 0.95} stroke="#050810" strokeWidth={2} />
      <circle r={14} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={2} />
      <text y={-16} textAnchor="middle" fontSize={9} fontWeight={700} fill={color} style={{ pointerEvents: "none" }}>
        {label}
      </text>
      {(hop.event.ignored || hop.event.dropped) && (
        <text x={10} y={4} fontSize={12} fontWeight={800} fill={hop.event.dropped ? "#f87171" : "#94a3b8"}>
          ✕
        </text>
      )}
    </g>
  );
}

function portLabel(device: Device | undefined, iface: string) {
  const i = device?.interfaces.find((x) => x.name === iface);
  if (!i || device?.kind !== "switch") return iface;
  if (i.trunk) return `${iface} · trunk`;
  return i.vlan && i.vlan !== 1 ? `${iface} · VLAN ${i.vlan}` : iface;
}

function LinkEdge({ id, source, target, sourceX, sourceY, targetX, targetY, data }: EdgeProps<LinkEdgeType>) {
  const hops = useLab((s) => s.activeHops);
  const net = useLab((s) => s.net);
  useLab((s) => s.version);
  const onLink = hops.filter((h) => h.event.linkId === id);
  // Keep busy links readable (and fast): draw only the newest few packets.
  const mine = onLink.slice(-MAX_DOTS_PER_LINK);
  const hidden = onLink.length - mine.length;
  const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  const busy = mine.length > 0;
  const labelAt = (t: number) => ({ x: sourceX + (targetX - sourceX) * t, y: sourceY + (targetY - sourceY) * t });
  const a = labelAt(0.24);
  const b = labelAt(0.76);
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: busy ? "#34d399" : "#334155", strokeWidth: busy ? 3 : 2, transition: "stroke 0.2s" }} />
      {data && (
        <>
          <text x={a.x} y={a.y - 6} fontSize={9} fill="#64748b" textAnchor="middle" className="font-mono">
            {portLabel(net.devices.get(source), data.aIface)}
          </text>
          <text x={b.x} y={b.y - 6} fontSize={9} fill="#64748b" textAnchor="middle" className="font-mono">
            {portLabel(net.devices.get(target), data.bIface)}
          </text>
        </>
      )}
      {hidden > 0 && (
        <text x={(sourceX + targetX) / 2} y={(sourceY + targetY) / 2 + 22} fontSize={10} fontWeight={700} fill="#fbbf24" textAnchor="middle">
          +{hidden} paket
        </text>
      )}
      {mine.map((hop) => (
        <PacketDot
          key={hop.event.id}
          hop={hop}
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
          reverse={hop.event.from !== source}
        />
      ))}
    </>
  );
}

const MAX_DOTS_PER_LINK = 4;
const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

export function NetworkCanvas() {
  const net = useLab((s) => s.net);
  const version = useLab((s) => s.version);
  const activeDevice = useLab((s) => s.activeDevice);
  const selectedDevice = useLab((s) => s.selectedDevice);
  const selectDevice = useLab((s) => s.selectDevice);

  const buildNodes = (): DeviceNodeType[] =>
    [...net.devices.values()].map((device) => ({
      id: device.id,
      type: "device",
      position: device.position,
      data: { device, active: device.id === activeDevice, selected: device.id === selectedDevice, version },
    }));

  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNodeType>(buildNodes());

  useEffect(() => {
    setNodes((current) =>
      [...net.devices.values()].map((device) => {
        const existing = current.find((n) => n.id === device.id);
        return {
          ...(existing ?? { id: device.id, type: "device" as const, position: device.position }),
          data: { device, active: device.id === activeDevice, selected: device.id === selectedDevice, version },
        };
      }),
    );
  }, [net, version, activeDevice, selectedDevice, setNodes]);

  const edges = useMemo<LinkEdgeType[]>(
    () =>
      net.links.map((link) => ({
        id: link.id,
        source: link.a.device,
        target: link.b.device,
        type: "link",
        data: { aIface: link.a.iface, bIface: link.b.iface },
        selectable: false,
      })),
    [net],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => selectDevice(node.id)}
        onPaneClick={() => selectDevice(null)}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={2}
        colorMode="dark"
        nodesConnectable={false}
      >
        <Background color="#1f2a40" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
