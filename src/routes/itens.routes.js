// Catálogo de itens inspecionados — seção 4 do docs/API.md.
// Somente leitura: o catálogo é dado de referência, mantido pelo esquema/seed.
import express from 'express'
import { ok, assincrono } from '../lib/respostas.js'
import { autenticar } from '../middleware/auth.js'
import { consultar } from '../db/index.js'

const router = express.Router()

router.use(autenticar)

// GET /api/itens — itens ativos na ordem de preenchimento do formulário.
router.get(
  '/',
  assincrono((req, res) => {
    const linhas = consultar(
      `SELECT chave, nome, dica, categoria, critico, ordem
       FROM itens_catalogo
       WHERE ativo = 1
       ORDER BY ordem ASC, nome COLLATE NOCASE ASC`
    )

    // O banco guarda 0/1; o contrato da API exige booleano.
    ok(
      res,
      linhas.map((linha) => ({
        chave: linha.chave,
        nome: linha.nome,
        dica: linha.dica ?? null,
        categoria: linha.categoria,
        critico: linha.critico === 1,
        ordem: linha.ordem
      }))
    )
  })
)

export default router
