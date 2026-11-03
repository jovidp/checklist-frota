// Configuração central da aplicação.
// Resolve tudo a partir da raiz do projeto para funcionar independentemente
// do diretório de onde o processo foi iniciado.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import dotenv from 'dotenv'

const ESTE_ARQUIVO = fileURLToPath(import.meta.url)
const RAIZ = path.resolve(path.dirname(ESTE_ARQUIVO), '..')

// .env é carregado a partir da raiz, nunca do cwd.
dotenv.config({ path: path.join(RAIZ, '.env') })

const PASTA_DADOS = path.join(RAIZ, 'data')

/** Resolve um caminho do .env contra a raiz do projeto (aceita absoluto). */
function caminhoAbsoluto(valor, padrao) {
  const bruto = (valor ?? '').trim() || padrao
  return path.isAbsolute(bruto) ? bruto : path.join(RAIZ, bruto)
}

/** Lê um número do ambiente, caindo no padrão quando ausente ou inválido. */
function numero(valor, padrao) {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : padrao
}

const DB_ARQUIVO = caminhoAbsoluto(process.env.DB_ARQUIVO, 'data/checklist.db')
const UPLOAD_DIR = caminhoAbsoluto(process.env.UPLOAD_DIR, 'data/uploads')

// As pastas precisam existir antes de o SQLite abrir o arquivo.
for (const pasta of [PASTA_DADOS, path.dirname(DB_ARQUIVO), UPLOAD_DIR]) {
  fs.mkdirSync(pasta, { recursive: true })
}

/**
 * Segredo do JWT. Sem ele no .env, geramos um e gravamos em data/.segredo —
 * assim os tokens emitidos continuam válidos após reiniciar o servidor.
 */
function obterSegredo() {
  const doAmbiente = (process.env.JWT_SEGREDO ?? '').trim()
  if (doAmbiente) return doAmbiente

  const arquivo = path.join(PASTA_DADOS, '.segredo')
  try {
    const salvo = fs.readFileSync(arquivo, 'utf8').trim()
    if (salvo.length >= 32) return salvo
  } catch {
    // Primeiro uso: o arquivo ainda não existe.
  }

  const novo = randomBytes(64).toString('hex')
  fs.writeFileSync(arquivo, novo, { encoding: 'utf8', mode: 0o600 })
  return novo
}

/** Versão publicada em /api/saude, lida do package.json. */
function obterVersao() {
  try {
    const pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'))
    return pacote.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const config = {
  RAIZ,
  VERSAO: obterVersao(),
  PORT: numero(process.env.PORT, 3000),
  JWT_SEGREDO: obterSegredo(),
  JWT_EXPIRA_HORAS: numero(process.env.JWT_EXPIRA_HORAS, 12),
  DB_ARQUIVO,
  UPLOAD_DIR,
  MAX_FOTO_MB: numero(process.env.MAX_FOTO_MB, 5),
  MAX_FOTOS_CHECKLIST: numero(process.env.MAX_FOTOS_CHECKLIST, 20),
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL ?? '').trim() || 'admin@transporte.com',
  // Sem senha padrão embutida: quando ADMIN_SENHA não está no .env, o seed
  // gera uma senha aleatória, marca-a como provisória e a exibe uma só vez.
  ADMIN_SENHA: (process.env.ADMIN_SENHA ?? '').trim() || null,
  AMBIENTE: (process.env.NODE_ENV ?? '').trim() || 'desenvolvimento'
}

export default config
