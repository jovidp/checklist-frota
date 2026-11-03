// Ponto de entrada do servidor HTTP.
import os from 'node:os'
import path from 'node:path'
import config from './config.js'
import app from './app.js'
import { garantirBanco, fechar } from './db/index.js'

/** IP da rede local, para acessar o sistema pelo celular. */
function ipDaRede() {
  for (const enderecos of Object.values(os.networkInterfaces())) {
    for (const e of enderecos ?? []) {
      if (e.family === 'IPv4' && !e.internal) return e.address
    }
  }
  return null
}

/** Caminho curto relativo à raiz, para o banner não ficar largo demais. */
function curto(alvo) {
  const relativo = path.relative(config.RAIZ, alvo)
  return relativo && !relativo.startsWith('..') ? relativo : alvo
}

function banner() {
  const ip = ipDaRede()
  const linhas = [
    'CHECKLIST DE CAMINHÕES',
    `versão ${config.VERSAO} · ambiente ${config.AMBIENTE}`,
    '',
    `Neste computador:  http://localhost:${config.PORT}`,
    ip ? `Na rede (celular): http://${ip}:${config.PORT}` : 'Rede local: indisponível',
    `Banco de dados:    ${curto(config.DB_ARQUIVO)}`,
    `Fotos:             ${curto(config.UPLOAD_DIR)}`,
    '',
    'Pressione Ctrl+C para encerrar.'
  ]

  const largura = Math.max(...linhas.map((l) => l.length)) + 2
  console.log('\n╔' + '═'.repeat(largura) + '╗')
  for (const linha of linhas) {
    console.log('║ ' + linha.padEnd(largura - 1) + '║')
  }
  console.log('╚' + '═'.repeat(largura) + '╝\n')
}

const criado = garantirBanco()
if (criado) console.log('Banco de dados criado a partir do esquema inicial.')

const servidor = app.listen(config.PORT, () => banner())

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(
      `\nA porta ${config.PORT} já está em uso.\n` +
        'Encerre o outro programa ou defina outra porta no arquivo .env (ex.: PORT=3001).\n'
    )
  } else {
    console.error('\nFalha ao iniciar o servidor:', erro.message, '\n')
  }
  process.exit(1)
})

/** Encerramento gracioso: para de aceitar conexões e fecha o banco. */
function encerrar(sinal) {
  console.log(`\nRecebido ${sinal}. Encerrando o servidor...`)
  servidor.close(() => {
    fechar()
    console.log('Servidor encerrado com segurança.')
    process.exit(0)
  })
  // Se alguma conexão travar, não deixamos o processo pendurado.
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGINT', () => encerrar('SIGINT'))
process.on('SIGTERM', () => encerrar('SIGTERM'))
