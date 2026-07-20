-- 文言解憂站 D1 後端 schema（取代 Upstash Redis）
-- 用四張表模擬 Redis 的 string / hash / list / sorted-set，
-- 每列帶 exp（到期 epoch 毫秒，NULL=永不過期），讀取時惰性過濾過期資料。
-- 三子系統共用，金鑰以前綴分命名空間：擂台 wy_rt: / 合契 wy_fuse: / 市集 wy_mkt:
-- 與 vocab-duel schema.sql 完全同構，可安全重複執行（全 IF NOT EXISTS）。

-- string：get/set/incr/del/exists/expire
CREATE TABLE IF NOT EXISTS kv (
  k   TEXT PRIMARY KEY,
  v   TEXT NOT NULL,
  exp INTEGER
);

-- hash：hget/hgetall/hset/hlen
CREATE TABLE IF NOT EXISTS hash (
  k   TEXT NOT NULL,
  f   TEXT NOT NULL,
  v   TEXT NOT NULL,
  exp INTEGER,
  PRIMARY KEY (k, f)
);

-- list：lpush/lrange/ltrim（用 autoincrement id 定序，新的在前 = id 大）
CREATE TABLE IF NOT EXISTS list (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  k   TEXT NOT NULL,
  v   TEXT NOT NULL,
  exp INTEGER
);
CREATE INDEX IF NOT EXISTS idx_list_k ON list (k, id);

-- sorted-set：zadd/zincrby/zrange/zrem/zremrangebyrank
CREATE TABLE IF NOT EXISTS zset (
  k      TEXT NOT NULL,
  member TEXT NOT NULL,
  score  REAL NOT NULL,
  exp    INTEGER,
  PRIMARY KEY (k, member)
);
CREATE INDEX IF NOT EXISTS idx_zset_score ON zset (k, score);
