// Rotas da trilha de auditoria — seção 8 do docs/API.md.
// Só leitura e só admin: quem opera o sistema não pode inspecionar (nem
// alterar) o registro do que todo mundo fez.
import express from 'express'
import { ok, assincrono } from '../lib/respostas.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { paginacao, texto } from '../lib/validacao.js'
import * as auditoria from '../services/auditoria.service.js'

const router = express.Router()

router.use(autenticar, exigirPerfil('admin'))

// GET /api/auditoria/opcoes — valores presentes na trilha, para os filtros.
// Vem antes da raiz por clareza; não há rota com parâmetro para conflitar.
router.get(
  '/opcoes',
  assincrono((req, res) => {
    ok(res, auditoria.opcoesDeFiltro())
  })
)

// GET /api/auditoria?busca=&acao=&entidade=&usuario_id=&de=&ate=&pagina=1&limite=50
router.get(
  '/',
  assincrono((req, res) => {
    const { pagina, limite, offset } = paginacao(req.query)

    const { itens, total } = auditoria.listar({
      busca: texto(req.query.busca, 60),
      acao: texto(req.query.acao, 40),
      entidade: texto(req.query.entidade, 40),
      usuario_id: req.query.usuario_id,
      de: req.query.de,
      ate: req.query.ate,
      limite,
      offset
    })

    ok(res, itens, {
      paginacao: { pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)) }
    })
  })
)

export default router
