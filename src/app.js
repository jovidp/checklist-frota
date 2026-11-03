// Montagem do Express: middlewares, arquivos estáticos e rotas da API.
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import config from './config.js'
import { db } from './db/index.js'
import { ok } from './lib/respostas.js'
import { tratarErros, rotaNaoEncontrada } from './middleware/erro.js'
import { opcional, exigirSenhaDefinitiva } from './middleware/auth.js'

import authRotas from './routes/auth.routes.js'
import usuariosRotas from './routes/usuarios.routes.js'
import veiculosRotas from './routes/veiculos.routes.js'
import itensRotas from './routes/itens.routes.js'
import checklistsRotas from './routes/checklists.routes.js'
import fotosRotas from './routes/fotos.routes.js'
import relatoriosRotas from './routes/relatorios.routes.js'
import exportarRotas from './routes/exportar.routes.js'
import auditoriaRotas from './routes/auditoria.routes.js'

const app = express()
const PASTA_PUBLICA = path.join(config.RAIZ, 'public')

// IP real do cliente atrás de proxy (auditoria e limite de tentativas de login).
// 'loopback' em vez de true: confiamos apenas no proxy local (Tailscale Funnel,
// nginx na mesma máquina). Com `true` o Express pega o X-Forwarded-For mais à
// esquerda, que o próprio cliente escreve — daria para forjar o IP e escapar do
// bloqueio por força bruta.
app.set('trust proxy', 'loopback')
app.disable('x-powered-by')

app.use(cors())
// Limite alto porque as fotos chegam em base64 no corpo do JSON.
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Log simples de requisições: método, url, status e duração.
app.use((req, res, next) => {
  const inicio = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} — ${ms.toFixed(1)}ms`)
  })
  next()
})

// Fotos: cache de 7 dias (o nome do arquivo é único, então nunca muda).
app.use(
  '/uploads',
  express.static(config.UPLOAD_DIR, {
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=604800')
  })
)

app.use(express.static(PASTA_PUBLICA, { index: 'index.html' }))

app.get('/api/saude', (req, res) => {
  let banco = 'conectado'
  try {
    db.prepare('SELECT 1').get()
  } catch {
    banco = 'indisponivel'
  }
  ok(res, {
    status: 'online',
    versao: config.VERSAO,
    banco,
    hora: new Date().toISOString()
  })
})

app.use('/api/auth', authRotas)

// Tudo que vem depois desta linha exige senha definitiva. /api/auth e
// /api/saude ficam de fora por já terem sido resolvidos acima.
app.use('/api', opcional, exigirSenhaDefinitiva)

app.use('/api/usuarios', usuariosRotas)
app.use('/api/veiculos', veiculosRotas)
app.use('/api/itens', itensRotas)
app.use('/api/checklists', checklistsRotas)
app.use('/api/fotos', fotosRotas)
app.use('/api/relatorios', relatoriosRotas)
app.use('/api/exportar', exportarRotas)
app.use('/api/auditoria', auditoriaRotas)

// Fallback da SPA: rotas de navegação (sem extensão e fora de /api)
// devolvem o index.html para o roteamento acontecer no navegador.
app.get(/^\/(?!api\/|uploads\/).*/, (req, res, next) => {
  if (path.extname(req.path)) return next()
  res.sendFile(path.join(PASTA_PUBLICA, 'index.html'), (erro) => {
    if (erro) next()
  })
})

app.use(rotaNaoEncontrada)
app.use(tratarErros)

export default app
