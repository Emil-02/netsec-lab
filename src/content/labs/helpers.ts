import type { LabContext } from "@/engine";

export const has = (fact: string) => (ctx: LabContext) => ctx.facts.has(fact);

export const hasMatch = (pattern: RegExp) => (ctx: LabContext) => [...ctx.facts].some((f) => pattern.test(f));

export function fileAt(ctx: LabContext, deviceId: string, path: string) {
  return ctx.net.device(deviceId).fs?.get(path) ?? null;
}

export const recent = (fact: string) => (ctx: LabContext) => ctx.recent.has(fact);

export const BASIC_COMMANDS = ["whoami", "hostname", "man", "history", "ls", "cat", "pwd", "cd", "echo", "grep", "head", "tail", "wc"];
export const NET_COMMANDS = [...BASIC_COMMANDS, "ping", "ip", "ifconfig", "arp", "route", "traceroute"];
