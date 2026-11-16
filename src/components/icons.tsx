import {
  ArrowLeftRight,
  Binary,
  BrickWall,
  Bug,
  Cable,
  Cloud,
  Eye,
  Flag,
  Globe,
  Key,
  Laptop,
  Layers,
  Monitor,
  Network,
  Radar,
  Rocket,
  Route,
  Router,
  Server,
  Share2,
  Shield,
  Skull,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { DeviceKind } from "@/engine/core/types";
import type { ModuleIcon } from "@/content/curriculum";

export const moduleIcons: Record<ModuleIcon, LucideIcon> = {
  rocket: Rocket,
  terminal: Terminal,
  network: Network,
  layers: Layers,
  binary: Binary,
  cable: Cable,
  route: Route,
  "arrow-left-right": ArrowLeftRight,
  globe: Globe,
  shield: Shield,
  radar: Radar,
  eye: Eye,
  key: Key,
  "brick-wall": BrickWall,
  bug: Bug,
  flag: Flag,
};

export const deviceIcons: Record<DeviceKind, LucideIcon> = {
  pc: Monitor,
  laptop: Laptop,
  server: Server,
  router: Router,
  switch: Network,
  hub: Share2,
  attacker: Skull,
  firewall: BrickWall,
  internet: Cloud,
};

export const deviceColors: Record<DeviceKind, string> = {
  pc: "#60a5fa",
  laptop: "#34d399",
  server: "#a78bfa",
  router: "#f59e0b",
  switch: "#22d3ee",
  hub: "#94a3b8",
  attacker: "#f87171",
  firewall: "#fb923c",
  internet: "#cbd5e1",
};

export const deviceKindLabel: Record<DeviceKind, string> = {
  pc: "PC",
  laptop: "Laptop",
  server: "Server",
  router: "Router",
  switch: "Switch",
  hub: "Hub",
  attacker: "Penyerang",
  firewall: "Firewall",
  internet: "Internet",
};
