// SQLite 持久化（node:sqlite 内置模块，主进程单写者）
// - DB 位于应用数据目录 workbuddy.db，WAL 模式
// - 加载/迁移失败时自动备份损坏文件并重建；再失败则降级为纯内存态
// - 渲染进程通过 db:* IPC 通道访问，本模块是唯一写入方
// - 使用 Node 内置 node:sqlite（无原生二进制依赖），macOS/Windows/Linux 打包行为一致
import { DatabaseSync } from 'node:sqlite'
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, renameSync } from 'fs'
import {
  IPC,
  type SessionPayload,
  type MessagePayload,
  type SettingsPatch,
  type UserPayload,
  type DbSnapshot
} from '../shared/types'

const SCHEMA_VERSION = 1

let db: DatabaseSync | null = null

export function isDbReady(): boolean {
  return db !== null
}

/** 打开数据库并确保 schema 就绪（含完整性预检，损坏时抛错由上层自愈） */
function openAndMigrate(dbPath: string): DatabaseSync {
  const conn = new DatabaseSync(dbPath)
  conn.exec('PRAGMA journal_mode = WAL')
  conn.exec('PRAGMA foreign_keys = ON')
  // 预检：损坏的库文件在查询系统表时才会暴露
  conn.prepare('SELECT count(*) FROM sqlite_master').get()
  conn.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mode TEXT,
      model TEXT,
      status TEXT,
      workspace TEXT,
      authorized_file TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (task_id, id)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  const version = (conn.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version
  if (version < SCHEMA_VERSION) {
    // 预留迁移位：未来版本在此按 version 阶梯升级
    conn.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }
  return conn
}

/** 事务助手（node:sqlite 无内置 transaction 包装，手动 BEGIN/COMMIT/ROLLBACK） */
function withTransaction<T>(fn: () => T): T {
  if (!db) throw new Error('db 未就绪')
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 忽略回滚异常，保留原始错误
    }
    throw err
  }
}

/** 初始化数据库；失败时备份损坏文件重建一次；仍失败返回 false（纯内存降级） */
export function initDb(): boolean {
  const dbPath = join(app.getPath('userData'), 'workbuddy.db')
  try {
    db = openAndMigrate(dbPath)
    normalizeStatuses()
    return true
  } catch (firstErr) {
    console.warn('[db] 打开失败，尝试重建:', firstErr)
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const p = dbPath + suffix
        if (existsSync(p)) renameSync(p, `${p}.corrupt-${Date.now()}`)
      }
      db = openAndMigrate(dbPath)
      normalizeStatuses()
      return true
    } catch (secondErr) {
      console.error('[db] 重建失败，降级为内存态:', secondErr)
      db = null
      return false
    }
  }
}

export function closeDb(): void {
  try {
    db?.close()
  } catch {
    // 忽略关闭异常（进程退出场景）
  }
  db = null
}

// ---- 行 ↔ 载荷映射 ----

interface TaskRow {
  id: string
  title: string
  mode: string | null
  model: string | null
  status: string | null
  workspace: string | null
  authorized_file: string | null
  created_at: number
  updated_at: number
}

interface MessageRow {
  id: string
  task_id: string
  role: string
  content: string
  meta: string | null
  created_at: number
}

function rowToSession(r: TaskRow): SessionPayload {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    workspace: r.workspace,
    authorizedFile: r.authorized_file,
    mode: r.mode,
    model: r.model,
    status: r.status
  }
}

function rowToMessage(r: MessageRow): MessagePayload {
  return {
    id: r.id,
    taskId: r.task_id,
    role: r.role,
    content: r.content,
    meta: r.meta,
    createdAt: r.created_at
  }
}

// ---- 读取 ----

export function getAllSessions(): SessionPayload[] {
  if (!db) return []
  return (db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as unknown as TaskRow[]).map(
    rowToSession
  )
}

export function getAllMessages(): MessagePayload[] {
  if (!db) return []
  return (
    db
      .prepare('SELECT * FROM messages ORDER BY task_id, created_at, rowid')
      .all() as unknown as MessageRow[]
  ).map(rowToMessage)
}

export function getSettings(): Record<string, string | number | boolean> {
  if (!db) return {}
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
    key: string
    value: string
  }[]
  const out: Record<string, string | number | boolean> = {}
  for (const row of rows) {
    try {
      const v = JSON.parse(row.value)
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[row.key] = v
    } catch {
      // 跳过无法解析的设置项
    }
  }
  return out
}

export function getUser(): UserPayload | null {
  if (!db) return null
  const row = db.prepare('SELECT name, plan, created_at FROM users WHERE id = 1').get() as
    | { name: string; plan: string; created_at: number }
    | undefined
  return row ? { name: row.name, plan: row.plan, createdAt: row.created_at } : null
}

/** 全量快照（db:load） */
export function getSnapshot(): DbSnapshot {
  return {
    sessions: getAllSessions(),
    messages: getAllMessages(),
    settings: getSettings(),
    user: getUser()
  }
}

// ---- 写入 ----

const upsertTaskStmt = `
  INSERT INTO tasks (id, title, mode, model, status, workspace, authorized_file, created_at, updated_at)
  VALUES (@id, @title, @mode, @model, @status, @workspace, @authorizedFile, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    mode = excluded.mode,
    model = excluded.model,
    status = excluded.status,
    workspace = excluded.workspace,
    authorized_file = excluded.authorized_file,
    updated_at = excluded.updated_at
`

export function upsertSession(s: SessionPayload): void {
  if (!db) return
  db.prepare(upsertTaskStmt).run({
    id: s.id,
    title: s.title,
    mode: s.mode ?? null,
    model: s.model ?? null,
    status: s.status ?? null,
    workspace: s.workspace ?? null,
    authorizedFile: s.authorizedFile ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  })
}

export function deleteSession(id: string): void {
  if (!db) return
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id) // 消息经 FK CASCADE 级联删除
}

export function upsertMessage(m: MessagePayload): void {
  if (!db) return
  db.prepare(upsertMessageStmt).run({
    id: m.id,
    taskId: m.taskId,
    role: m.role,
    content: m.content,
    meta: m.meta ?? null,
    createdAt: m.createdAt
  })
}

const upsertMessageStmt = `
  INSERT INTO messages (id, task_id, role, content, meta, created_at)
  VALUES (@id, @taskId, @role, @content, @meta, @createdAt)
  ON CONFLICT(task_id, id) DO UPDATE SET
    role = excluded.role,
    content = excluded.content,
    meta = excluded.meta,
    created_at = excluded.created_at
`

export function replaceMessages(taskId: string, messages: MessagePayload[]): void {
  if (!db) return
  withTransaction(() => {
    db!.prepare('DELETE FROM messages WHERE task_id = ?').run(taskId)
    const stmt = db!.prepare(upsertMessageStmt)
    for (const m of messages) {
      stmt.run({
        id: m.id,
        taskId: m.taskId,
        role: m.role,
        content: m.content,
        meta: m.meta ?? null,
        createdAt: m.createdAt
      })
    }
  })
}

export function upsertSettings(patch: SettingsPatch): void {
  if (!db) return
  const stmt = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  withTransaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) {
        db!.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
      } else {
        stmt.run(key, JSON.stringify(value))
      }
    }
  })
}

export function upsertUser(user: UserPayload): void {
  if (!db) return
  db.prepare(
    `INSERT INTO users (id, name, plan, created_at) VALUES (1, @name, @plan, @createdAt)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, plan = excluded.plan`
  ).run({ name: user.name, plan: user.plan, createdAt: user.createdAt ?? Date.now() })
}

// ---- 启动归一化 + 注册 IPC ----

/** 重启归一化：running 状态的任务复位为 idle（流式中断的回复按约定丢弃） */
function normalizeStatuses(): void {
  if (!db) return
  db.prepare(`UPDATE tasks SET status = 'idle' WHERE status = 'running'`).run()
}

/** 注册 db:* IPC 通道（需在 app.whenReady 之后调用；DB 未就绪时静默吞掉调用，渲染进程自行降级） */
export function registerDbHandlers(): void {
  ipcMain.handle(IPC.dbLoad, () => (db ? getSnapshot() : null))
  ipcMain.handle(IPC.dbSessionUpsert, (_e, s: SessionPayload) => db && upsertSession(s))
  ipcMain.handle(IPC.dbSessionDelete, (_e, id: string) => db && deleteSession(id))
  ipcMain.handle(IPC.dbMessageUpsert, (_e, m: MessagePayload) => db && upsertMessage(m))
  ipcMain.handle(
    IPC.dbMessagesReplace,
    (_e, taskId: string, msgs: MessagePayload[]) => db && replaceMessages(taskId, msgs)
  )
  ipcMain.handle(IPC.dbSettingsUpsert, (_e, patch: SettingsPatch) => db && upsertSettings(patch))
  ipcMain.handle(IPC.dbUserUpsert, (_e, u: UserPayload) => db && upsertUser(u))
}
