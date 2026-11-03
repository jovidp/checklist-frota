// Script: npm run migrate — aplica src/db/schema.sql (idempotente).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../config.js'
import { db, consultar, garantirColunas, fechar } from './index.js'

const ARQUIVO_SCHEMA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql')

console.log('\n=== Migração do banco de dados ===')
console.log(`Arquivo: ${config.DB_ARQUIVO}\n`)

try {
  db.exec(fs.readFileSync(ARQUIVO_SCHEMA, 'utf8'))
  garantirColunas() // colunas novas em tabelas que já existiam
  console.log('Esquema aplicado com sucesso.\n')

  const tabelas = consultar(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  )

  console.log('Tabelas existentes:')
  for (const t of tabelas) {
    const { total } = consultar(`SELECT COUNT(*) AS total FROM "${t.name}"`)[0]
    console.log(`  - ${t.name.padEnd(18)} ${total} registro(s)`)
  }

  const visoes = consultar(
    "SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name"
  )
  if (visoes.length > 0) {
    console.log('\nVisões (views):')
    for (const v of visoes) console.log(`  - ${v.name}`)
  }

  console.log('\nMigração concluída.\n')
} catch (erro) {
  console.error('\nFalha na migração:', erro.message, '\n')
  process.exitCode = 1
} finally {
  fechar()
}
