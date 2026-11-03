// Rotas de relatórios — /api/relatorios (todas autenticadas).
import express from 'express'
import { ok, assincrono } from '../lib/respostas.js'
import { autenticar } from '../middleware/auth.js'
import { comoInteiro } from '../lib/validacao.js'
import * as relatorios from '../services/relatorios.service.js'

const router = express.Router()

// Nenhum relatório é público: exigimos token em todas as rotas do módulo.
router.use(autenticar)

// GET /api/relatorios/resumo?de=&ate=
router.get(
  '/resumo',
  assincrono((req, res) => {
    const dados = relatorios.resumo({ de: req.query.de, ate: req.query.ate })
    ok(res, dados)
  })
)

// GET /api/relatorios/nao-conformidades?de=&ate=&limite=10
router.get(
  '/nao-conformidades',
  assincrono((req, res) => {
    const dados = relatorios.naoConformidades({
      de: req.query.de,
      ate: req.query.ate,
      limite: comoInteiro(req.query.limite, 10) ?? 10
    })
    ok(res, dados)
  })
)

// GET /api/relatorios/veiculos?de=&ate=
router.get(
  '/veiculos',
  assincrono((req, res) => {
    const dados = relatorios.porVeiculo({ de: req.query.de, ate: req.query.ate })
    ok(res, dados)
  })
)

// GET /api/relatorios/alertas — vencimentos de documentos (não usa período)
router.get(
  '/alertas',
  assincrono((req, res) => {
    ok(res, relatorios.alertas())
  })
)

export default router
