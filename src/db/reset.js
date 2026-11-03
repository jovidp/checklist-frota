// Script: npm run reset — APAGA o banco e as fotos, depois recria tudo.
// Uso: CONFIRMAR=SIM npm run reset
// Não importa db/index.js: abrir a conexão travaria o arquivo antes de apagá-lo.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import config from '../config.js'

const PASTA = path.dirname(fileURLToPath(import.meta.url))

if (process.env.CONFIRMAR !== 'SIM') {
  console.error('\n*** ATENÇÃO: operação destrutiva ***')
  console.error('Este comando apaga TODOS os checklists, veículos, usuários e fotos.')
  console.error('\nPara confirmar, execute:')
  console.error('  Windows (PowerShell):  $env:CONFIRMAR="SIM"; npm run reset')
  console.error('  Linux/macOS:           CONFIRMAR=SIM npm run reset\n')
  process.exit(1)
}

console.log('\n=== Recriação completa do banco ===\n')

/** Pausa síncrona — o script é sequencial e não tem laço de eventos livre. */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * No Windows o arquivo do banco fica bloqueado enquanto o servidor estiver
 * rodando. Tentamos algumas vezes antes de orientar o usuário a encerrá-lo.
 */
function apagar(alvo) {
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    try {
      fs.rmSync(alvo, { force: true })
      return true
    } catch (erro) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(erro.code) || tentativa === 5) {
        if (['EPERM', 'EBUSY', 'EACCES'].includes(erro.code)) {
          console.error(`\nNão foi possível apagar "${path.basename(alvo)}": o arquivo está em uso.`)
          console.error('O servidor provavelmente está rodando e mantém o banco aberto.')
          console.error('Encerre-o (Ctrl+C na janela do "npm start"/"npm run dev") e execute o reset novamente.\n')
          process.exit(1)
        }
        throw erro
      }
      esperar(200)
    }
  }
  return false
}

// O SQLite em modo WAL mantém arquivos auxiliares ao lado do banco.
let apagados = 0
for (const sufixo of ['', '-wal', '-shm']) {
  const alvo = config.DB_ARQUIVO + sufixo
  if (fs.existsSync(alvo)) {
    apagar(alvo)
    apagados += 1
    console.log(`Apagado: ${path.basename(alvo)}`)
  }
}
if (apagados === 0) console.log('Nenhum arquivo de banco encontrado — seguindo.')

let fotos = 0
if (fs.existsSync(config.UPLOAD_DIR)) {
  for (const arquivo of fs.readdirSync(config.UPLOAD_DIR)) {
    apagar(path.join(config.UPLOAD_DIR, arquivo))
    fotos += 1
  }
}
console.log(`Fotos removidas: ${fotos}\n`)

// Subprocessos garantem conexões novas e isoladas para cada etapa.
for (const script of ['migrate.js', 'seed.js']) {
  execFileSync(process.execPath, [path.join(PASTA, script)], { stdio: 'inherit' })
}

console.log('Banco recriado com sucesso.\n')
