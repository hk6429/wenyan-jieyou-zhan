// node:sqlite 假 D1（Node 22.5+，本機 v22.22.3）：把 D1 的 prepare/bind/first/all/run/batch 映到 DatabaseSync。
// schema 直接讀 repo 根的 schema.sql，保證測試環境與正式 D1 同構。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCHEMA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../schema.sql'), 'utf8');

export function createFakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  // node:sqlite 回 null-prototype 物件；真實 D1 回一般物件，這裡攤平成一般物件對齊。
  const plain = (row) => (row == null ? null : { ...row });
  const mkStmt = (sql, args) => ({
    sql, args,
    async first(col) {
      const row = plain(db.prepare(sql).get(...args));
      if (row == null) return null;
      return col === undefined ? row : (row[col] ?? null);
    },
    async all() { return { results: db.prepare(sql).all(...args).map(plain) }; },
    async run() { db.prepare(sql).run(...args); return { success: true }; },
  });
  return {
    prepare(sql) { return { bind: (...args) => mkStmt(sql, args) }; },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; },
  };
}
