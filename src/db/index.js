// Camada de acesso ao SQLite usando o módulo nativo node:sqlite.
// Toda consulta usa parâmetros posicionais "?" — nunca concatenação de SQL.
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../config.js'

const PASTA_DESTE_ARQUIVO = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO_SCHEMA = path.join(PASTA_DESTE_ARQUIVO, 'schema.sql')

export const db = new DatabaseSync(config.DB_ARQUIVO)

// WAL melhora leituras concorrentes; busy_timeout evita SQLITE_BUSY imediato.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`)

/** Linhas do node:sqlite têm protótipo null — convertemos para objeto simples. */
function simples(linha) {
  return linha ? { ...linha } : null
}

export function consultar(sql, ...params) {
  return db.prepare(sql).all(...params).map((linha) => ({ ...linha }))
}

export function consultarUm(sql, ...params) {
  return simples(db.prepare(sql).get(...params))
}

export function executar(sql, ...params) {
  const r = db.prepare(sql).run(...params)
  // lastInsertRowid pode vir como BigInt.
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }
}

// Profundidade de transação: o SQLite não aceita BEGIN aninhado, então
// apenas a chamada mais externa abre e finaliza a transação de fato.
let profundidade = 0

export function transacao(fn) {
  if (profundidade > 0) return fn()

  db.exec('BEGIN')
  profundidade = 1
  try {
    const resultado = fn()
    db.exec('COMMIT')
    return resultado
  } catch (erro) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Se o rollback falhar, o erro original é o que importa.
    }
    throw erro
  } finally {
    profundidade = 0
  }
}

// Colunas acrescentadas depois da primeira versão do esquema. CREATE TABLE
// IF NOT EXISTS não altera tabelas já existentes, então elas entram por ALTER.
const COLUNAS_NOVAS = [
  ['usuarios', 'senha_provisoria', 'INTEGER NOT NULL DEFAULT 0 CHECK (senha_provisoria IN (0,1))'],
  [
    'checklists',
    'aprovacao',
    "TEXT CHECK (aprovacao IN ('APROVADO','REPROVADO') OR aprovacao IS NULL)"
  ]
]

/** Acrescenta ao banco antigo as colunas criadas depois dele. Idempotente. */
export function garantirColunas() {
  for (const [tabela, coluna, definicao] of COLUNAS_NOVAS) {
    const colunas = consultar(`PRAGMA table_info("${tabela}")`)
    if (colunas.some((c) => c.name === coluna)) continue
    db.exec(`ALTER TABLE "${tabela}" ADD COLUMN ${coluna} ${definicao}`)
  }
}

// A view congela a lista de colunas do momento em que foi criada: uma coluna
// nova em `checklists` não aparece nela sozinha. Recriar a cada abertura é
// barato e mantém a definição sempre igual à do schema.sql.
const VIEW_HISTORICO = `
DROP VIEW IF EXISTS vw_checklists;
CREATE VIEW vw_checklists AS
SELECT
  c.id, c.data, c.hora, c.km, c.status, c.aprovacao,
  c.total_ok, c.total_nc, c.total_na, c.total_pendente,
  c.lona_possui, c.lona_condicao,
  c.criado_em,
  v.id AS veiculo_id, v.placa, v.frota, v.modelo,
  u.id AS usuario_id, u.nome AS responsavel,
  (SELECT COUNT(*) FROM fotos f WHERE f.checklist_id = c.id) AS total_fotos
FROM checklists c
JOIN veiculos v ON v.id = c.veiculo_id
JOIN usuarios u ON u.id = c.usuario_id;
`

/** Mantém a vw_checklists alinhada com as colunas atuais. Idempotente. */
export function garantirView() {
  db.exec(VIEW_HISTORICO)
}

/** Cria o esquema caso o banco ainda esteja vazio. Idempotente. */
export function garantirBanco() {
  const existe = consultarUm(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    'checklists'
  )
  if (existe) {
    garantirColunas()
    garantirView()
    return false
  }

  db.exec(fs.readFileSync(ARQUIVO_SCHEMA, 'utf8'))
  return true
}

let fechado = false

export function fechar() {
  if (fechado) return
  fechado = true
  try {
    db.close()
  } catch {
    // Conexão já encerrada.
  }
}

// Garante liberação do arquivo do banco ao encerrar o processo.
process.on('exit', fechar)
