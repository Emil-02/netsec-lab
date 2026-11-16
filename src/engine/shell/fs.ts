export interface FsFile {
  type: "file";
  content: string;
  mode: number;
  owner: string;
}

export interface FsDir {
  type: "dir";
  children: Map<string, FsNode>;
  mode: number;
  owner: string;
}

export type FsNode = FsFile | FsDir;

export class FsError extends Error {}

/** File content, or detailed spec (use `dir: true` for an empty directory). */
export type FileSpec = string | { content?: string; mode?: number; owner?: string; dir?: boolean };

function dir(owner = "root", mode = 0o755): FsDir {
  return { type: "dir", children: new Map(), mode, owner };
}

export class VirtualFS {
  root: FsDir = dir();
  constructor(public home: string, public user: string) {}

  static create(user: string, files: Record<string, FileSpec> = {}): VirtualFS {
    const home = user === "root" ? "/root" : `/home/${user}`;
    const fs = new VirtualFS(home, user);
    for (const path of ["/bin", "/etc", "/tmp", "/var/log", "/home", home]) fs.mkdirp(path, path === home ? user : "root");
    (fs.get("/tmp") as FsDir).mode = 0o777;
    fs.writeFile("/etc/hostname", "localhost\n", "root");
    for (const [path, spec] of Object.entries(files)) {
      const abs = fs.resolve(path, home);
      const defaultOwner = abs.startsWith(home) ? user : "root";
      const parent = abs.slice(0, abs.lastIndexOf("/")) || "/";
      fs.mkdirp(parent, defaultOwner);
      const file = typeof spec === "string" ? { content: spec } : spec;
      if (file.dir) {
        fs.mkdirp(abs, file.owner ?? defaultOwner);
        continue;
      }
      fs.writeFile(abs, file.content ?? "", file.owner ?? defaultOwner);
      const node = fs.get(abs);
      if (node && file.mode !== undefined) node.mode = file.mode;
    }
    return fs;
  }

  /** Resolves `path` relative to `cwd`, expanding `~`, `.` and `..`. */
  resolve(path: string, cwd: string): string {
    let p = path;
    if (p === "~" || p.startsWith("~/")) p = this.home + p.slice(1);
    const parts = (p.startsWith("/") ? p : `${cwd}/${p}`).split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    return "/" + stack.join("/");
  }

  get(abs: string): FsNode | null {
    if (abs === "/") return this.root;
    let node: FsNode = this.root;
    for (const part of abs.split("/").filter(Boolean)) {
      if (node.type !== "dir") return null;
      const next: FsNode | undefined = node.children.get(part);
      if (!next) return null;
      node = next;
    }
    return node;
  }

  private parentOf(abs: string): { parent: FsDir; name: string } {
    const idx = abs.lastIndexOf("/");
    const parentPath = abs.slice(0, idx) || "/";
    const name = abs.slice(idx + 1);
    const parent = this.get(parentPath);
    if (!parent) throw new FsError(`${parentPath}: Tidak ada file atau direktori tersebut`);
    if (parent.type !== "dir") throw new FsError(`${parentPath}: Bukan direktori`);
    return { parent, name };
  }

  /** Whether `user` may create or modify `abs` (write permission on the file, or on its parent directory). */
  canWrite(abs: string, user: string, isRoot: boolean): boolean {
    if (isRoot) return true;
    const writable = (node: FsNode) => (node.owner === user ? (node.mode & 0o200) !== 0 : (node.mode & 0o002) !== 0);
    const node = this.get(abs);
    if (node) return writable(node);
    const parent = this.get(abs.slice(0, abs.lastIndexOf("/")) || "/");
    return !parent || writable(parent);
  }

  mkdirp(abs: string, owner = this.user) {
    let node: FsDir = this.root;
    for (const part of abs.split("/").filter(Boolean)) {
      let next = node.children.get(part);
      if (!next) {
        next = dir(owner);
        node.children.set(part, next);
      }
      if (next.type !== "dir") throw new FsError(`${abs}: Bukan direktori`);
      node = next;
    }
  }

  mkdir(abs: string) {
    const { parent, name } = this.parentOf(abs);
    if (parent.children.has(name)) throw new FsError(`tidak dapat membuat direktori '${name}': File sudah ada`);
    parent.children.set(name, dir(this.user));
  }

  writeFile(abs: string, content: string, owner = this.user, append = false) {
    const { parent, name } = this.parentOf(abs);
    const existing = parent.children.get(name);
    if (existing?.type === "dir") throw new FsError(`${name}: Adalah sebuah direktori`);
    if (existing) {
      existing.content = append ? existing.content + content : content;
      return;
    }
    parent.children.set(name, { type: "file", content, mode: 0o644, owner });
  }

  remove(abs: string, recursive = false) {
    const { parent, name } = this.parentOf(abs);
    const node = parent.children.get(name);
    if (!node) throw new FsError(`'${name}': Tidak ada file atau direktori tersebut`);
    if (node.type === "dir" && !recursive) throw new FsError(`'${name}': Adalah sebuah direktori (gunakan -r)`);
    parent.children.delete(name);
  }

  move(fromAbs: string, toAbs: string) {
    const node = this.get(fromAbs);
    if (!node) throw new FsError(`'${fromAbs}': Tidak ada file atau direktori tersebut`);
    const dest = this.get(toAbs);
    const target = dest?.type === "dir" ? `${toAbs}/${fromAbs.split("/").pop()}` : toAbs;
    const { parent: toParent, name: toName } = this.parentOf(target);
    const { parent: fromParent, name: fromName } = this.parentOf(fromAbs);
    fromParent.children.delete(fromName);
    toParent.children.set(toName, node);
  }

  copy(fromAbs: string, toAbs: string) {
    const node = this.get(fromAbs);
    if (!node) throw new FsError(`'${fromAbs}': Tidak ada file atau direktori tersebut`);
    if (node.type === "dir") throw new FsError(`-r tidak didukung: '${fromAbs}' adalah direktori`);
    const dest = this.get(toAbs);
    const target = dest?.type === "dir" ? `${toAbs}/${fromAbs.split("/").pop()}` : toAbs;
    this.writeFile(target, node.content);
  }
}

export function formatMode(node: FsNode): string {
  const bits = ["r", "w", "x"];
  let out = node.type === "dir" ? "d" : "-";
  for (let i = 8; i >= 0; i--) out += node.mode & (1 << i) ? bits[(8 - i) % 3] : "-";
  return out;
}
