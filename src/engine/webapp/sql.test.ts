import { describe, expect, it } from "vitest";
import { runQuery, SqlError, type Database } from "./sql";

const db: Database = {
  users: {
    columns: ["id", "username", "pw"],
    rows: [
      [1, "admin", "x1"],
      [2, "budi", "x2"],
    ],
  },
};

describe("mini SQL engine", () => {
  it("filters with WHERE, AND/OR, LIKE and LIMIT", () => {
    expect(runQuery(db, "SELECT username FROM users WHERE id = 2").rows).toEqual([["budi"]]);
    expect(runQuery(db, "SELECT username FROM users WHERE username LIKE '%DM%'").rows).toEqual([["admin"]]);
    expect(runQuery(db, "SELECT * FROM users WHERE id = 1 OR id = 2 LIMIT 1").rows).toHaveLength(1);
  });

  it("is injectable when input is concatenated", () => {
    const input = "nobody' OR '1'='1";
    expect(runQuery(db, `SELECT username FROM users WHERE username = '${input}'`).rows).toHaveLength(2);
    const comment = "admin' -- ";
    expect(runQuery(db, `SELECT username FROM users WHERE username = '${comment}' AND pw = 'salah'`).rows).toEqual([["admin"]]);
  });

  it("supports UNION and information_schema, and checks column counts", () => {
    const r = runQuery(db, "SELECT username, pw FROM users WHERE id = 99 UNION SELECT table_name, table_schema FROM information_schema.tables");
    expect(r.rows).toEqual([["users", "app"]]);
    expect(() => runQuery(db, "SELECT username FROM users UNION SELECT 1, 2")).toThrow("different number of columns");
  });

  it("binds prepared-statement parameters as data", () => {
    const r = runQuery(db, "SELECT username FROM users WHERE username = ? AND pw = ?", ["admin' -- ", "salah"]);
    expect(r.rows).toEqual([]);
  });

  it("reports MySQL-like errors", () => {
    expect(() => runQuery(db, "SELECT * FROM users WHERE username = 'admin'--x'")).toThrow(SqlError);
    expect(() => runQuery(db, "SELECT * FROM users WHERE username = '''")).toThrow(SqlError);
    expect(() => runQuery(db, "SELECT * FROM rahasia")).toThrow("Table 'app.rahasia' doesn't exist");
    expect(() => runQuery(db, "SELECT nope FROM users")).toThrow("Unknown column 'nope'");
    expect(() => runQuery(db, "SELECT 1; DROP TABLE users")).toThrow("stacked query");
  });
});
