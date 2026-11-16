/**
 * A tiny SQL engine (SELECT only) used by the lab web apps. It is intentionally
 * close to MySQL in its error messages so learners can see how input changes a query.
 */

export type Value = string | number | null;

export interface Table {
  columns: string[];
  rows: Value[][];
}

export type Database = Record<string, Table>;

export interface QueryResult {
  columns: string[];
  rows: Value[][];
}

export class SqlError extends Error {}

type Token =
  | { t: "kw"; v: string }
  | { t: "id"; v: string }
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "end" };

const KEYWORDS = new Set(["SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "UNION", "ALL", "LIMIT", "LIKE", "NULL", "ORDER", "BY", "ASC", "DESC"]);

function syntaxErrorNear(near: string): SqlError {
  return new SqlError(`You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${near}' at line 1`);
}

export function tokenize(sql: string, params: Value[] = []): Token[] {
  const out: Token[] = [];
  let i = 0;
  let param = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === "#" || (c === "-" && sql[i + 1] === "-" && (i + 2 >= sql.length || /\s/.test(sql[i + 2])))) {
      // MySQL only treats "--" as a comment when it is followed by whitespace (or ends the query).
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (c === ";") {
      i++;
      if (sql.slice(i).trim()) throw new SqlError("Lab ini hanya mengizinkan satu query per perintah (stacked query diblokir).");
    } else if (c === "'" || c === '"') {
      const start = i;
      let v = "";
      i++;
      for (;;) {
        if (i >= sql.length) throw syntaxErrorNear(sql.slice(start, start + 30));
        if (sql[i] === c && sql[i + 1] === c) {
          v += c;
          i += 2;
        } else if (sql[i] === c) {
          i++;
          break;
        } else if (sql[i] === "\\" && i + 1 < sql.length) {
          v += sql[i + 1];
          i += 2;
        } else v += sql[i++];
      }
      out.push({ t: "str", v });
    } else if (/[0-9]/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(sql.slice(i))!;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(sql.slice(i))!;
      const up = m[0].toUpperCase();
      out.push(KEYWORDS.has(up) ? { t: "kw", v: up } : { t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
    } else if (c === "?") {
      // Prepared statement placeholder: the value is bound as data, never parsed as SQL.
      const v = params[param++];
      out.push(typeof v === "number" ? { t: "num", v } : { t: "str", v: v === null || v === undefined ? "" : String(v) });
      i++;
    } else {
      const two = sql.slice(i, i + 2);
      if (["<=", ">=", "<>", "!="].includes(two)) {
        out.push({ t: "op", v: two });
        i += 2;
      } else if ("=<>(),*".includes(c)) {
        out.push({ t: "op", v: c });
        i++;
      } else throw syntaxErrorNear(sql.slice(i, i + 30));
    }
  }
  out.push({ t: "end" });
  return out;
}

type Expr =
  | { k: "lit"; v: Value }
  | { k: "col"; name: string }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "not"; e: Expr };

interface Select {
  star: boolean;
  items: Expr[];
  from: string;
  where?: Expr;
  limit?: number;
}

class Parser {
  i = 0;
  constructor(private toks: Token[]) {}

  peek() {
    return this.toks[this.i];
  }
  next() {
    return this.toks[this.i++];
  }
  isKw(v: string) {
    const p = this.peek();
    return p.t === "kw" && p.v === v;
  }
  isOp(v: string) {
    const p = this.peek();
    return p.t === "op" && p.v === v;
  }
  fail(): never {
    const tok = this.peek();
    const shown = tok.t === "end" ? "" : tok.t === "str" ? `'${tok.v}'` : String(tok.v);
    throw syntaxErrorNear(shown);
  }
  expectKw(v: string) {
    if (!this.isKw(v)) this.fail();
    this.next();
  }

  parseQuery(): Select[] {
    const selects = [this.parseSelect()];
    while (this.isKw("UNION")) {
      this.next();
      if (this.isKw("ALL")) this.next();
      selects.push(this.parseSelect());
    }
    if (this.peek().t !== "end") this.fail();
    return selects;
  }

  parseSelect(): Select {
    this.expectKw("SELECT");
    const sel: Select = { star: false, items: [], from: "" };
    if (this.isOp("*")) {
      this.next();
      sel.star = true;
    } else {
      sel.items.push(this.parseExpr());
      while (this.isOp(",")) {
        this.next();
        sel.items.push(this.parseExpr());
      }
    }
    if (this.isKw("FROM")) {
      this.next();
      const t = this.next();
      if (t.t !== "id") {
        this.i--;
        this.fail();
      }
      sel.from = t.v;
    }
    if (this.isKw("WHERE")) {
      this.next();
      sel.where = this.parseExpr();
    }
    if (this.isKw("ORDER")) {
      this.next();
      this.expectKw("BY");
      this.parseExpr();
      if (this.isKw("ASC") || this.isKw("DESC")) this.next();
    }
    if (this.isKw("LIMIT")) {
      this.next();
      const n = this.next();
      if (n.t !== "num") {
        this.i--;
        this.fail();
      }
      sel.limit = n.v;
    }
    return sel;
  }

  parseExpr(): Expr {
    let l = this.parseAnd();
    while (this.isKw("OR")) {
      this.next();
      l = { k: "bin", op: "OR", l, r: this.parseAnd() };
    }
    return l;
  }
  parseAnd(): Expr {
    let l = this.parseNot();
    while (this.isKw("AND")) {
      this.next();
      l = { k: "bin", op: "AND", l, r: this.parseNot() };
    }
    return l;
  }
  parseNot(): Expr {
    if (this.isKw("NOT")) {
      this.next();
      return { k: "not", e: this.parseNot() };
    }
    return this.parseCmp();
  }
  parseCmp(): Expr {
    const l = this.parsePrimary();
    const p = this.peek();
    if (p.t === "op" && ["=", "<", ">", "<=", ">=", "<>", "!="].includes(p.v)) {
      this.next();
      return { k: "bin", op: p.v, l, r: this.parsePrimary() };
    }
    if (this.isKw("LIKE")) {
      this.next();
      return { k: "bin", op: "LIKE", l, r: this.parsePrimary() };
    }
    return l;
  }
  parsePrimary(): Expr {
    const t = this.next();
    if (t.t === "str" || t.t === "num") return { k: "lit", v: t.v };
    if (t.t === "kw" && t.v === "NULL") return { k: "lit", v: null };
    if (t.t === "id") return { k: "col", name: t.v };
    if (t.t === "op" && t.v === "(") {
      const e = this.parseExpr();
      if (!this.isOp(")")) this.fail();
      this.next();
      return e;
    }
    this.i--;
    this.fail();
  }
}

function truthy(v: Value) {
  if (v === null) return false;
  if (typeof v === "number") return v !== 0;
  const n = Number(v);
  return Number.isNaN(n) ? false : n !== 0;
}

function compare(a: Value, b: Value): number {
  if (typeof a === "number" || typeof b === "number") return Number(a) - Number(b);
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

function likeToRegex(pattern: string) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "is");
}

function evaluate(e: Expr, row: Record<string, Value>, clause: string): Value {
  switch (e.k) {
    case "lit":
      return e.v;
    case "col": {
      const name = e.name.includes(".") ? e.name.split(".").pop()! : e.name;
      if (!(name in row)) throw new SqlError(`Unknown column '${e.name}' in '${clause}'`);
      return row[name];
    }
    case "not":
      return truthy(evaluate(e.e, row, clause)) ? 0 : 1;
    case "bin": {
      if (e.op === "AND") return truthy(evaluate(e.l, row, clause)) && truthy(evaluate(e.r, row, clause)) ? 1 : 0;
      if (e.op === "OR") return truthy(evaluate(e.l, row, clause)) || truthy(evaluate(e.r, row, clause)) ? 1 : 0;
      const a = evaluate(e.l, row, clause);
      const b = evaluate(e.r, row, clause);
      if (a === null || b === null) return null;
      if (e.op === "LIKE") return likeToRegex(String(b)).test(String(a)) ? 1 : 0;
      const c = compare(a, b);
      const ok: Record<string, boolean> = { "=": c === 0, "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0, "<>": c !== 0, "!=": c !== 0 };
      return ok[e.op] ? 1 : 0;
    }
  }
}

/** Virtual metadata tables, as found in MySQL's information_schema. */
function tableFor(db: Database, name: string, dbName: string): Table | undefined {
  if (name === "information_schema.tables") {
    return { columns: ["table_schema", "table_name"], rows: Object.keys(db).map((t) => [dbName, t]) };
  }
  if (name === "information_schema.columns") {
    return {
      columns: ["table_schema", "table_name", "column_name"],
      rows: Object.entries(db).flatMap(([t, tbl]) => tbl.columns.map((c) => [dbName, t, c])),
    };
  }
  return db[name];
}

function exprName(e: Expr): string {
  if (e.k === "col") return e.name.split(".").pop()!;
  if (e.k === "lit") return e.v === null ? "NULL" : String(e.v);
  return "expr";
}

export function runQuery(db: Database, sql: string, params: Value[] = [], dbName = "app"): QueryResult {
  const selects = new Parser(tokenize(sql, params)).parseQuery();
  let columns: string[] | null = null;
  const rows: Value[][] = [];
  for (const sel of selects) {
    let source: Table = { columns: [], rows: [[]] };
    if (sel.from) {
      const t = tableFor(db, sel.from, dbName);
      if (!t) throw new SqlError(`Table '${dbName}.${sel.from}' doesn't exist`);
      source = t;
    }
    const outCols = sel.star ? source.columns : sel.items.map(exprName);
    if (columns && columns.length !== outCols.length) {
      throw new SqlError("The used SELECT statements have a different number of columns");
    }
    columns ??= outCols;
    let produced = 0;
    for (const raw of source.rows) {
      const row = Object.fromEntries(source.columns.map((c, i) => [c, raw[i]]));
      if (sel.where && !truthy(evaluate(sel.where, row, "where clause"))) continue;
      if (sel.limit !== undefined && produced >= sel.limit) break;
      rows.push(sel.star ? [...raw] : sel.items.map((e) => evaluate(e, row, "field list")));
      produced++;
    }
  }
  return { columns: columns ?? [], rows };
}
