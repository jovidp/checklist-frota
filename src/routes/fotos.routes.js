// Rotas de fotos avulsas — montadas em /api/fotos.
// O envio e a listagem ficam sob o checklist (/api/checklists/:id/fotos);
// aqui tratamos apenas a exclusão de uma foto específica.
import { Router } from 'express'
import { autenticar } from '../middleware/auth.js'
import { ok, assincrono, ErroApi } from '../lib/respostas.js'
import { comoInteiro } from '../lib/validacao.js'
import { registrar } from '../lib/auditoria.js'
import { removerFoto } from '../services/checklists.service.js'

const router = Router()

router.use(autenticar)

/** Converte o :id da URL em inteiro positivo ou recusa a requisição. */
function idDaRota(valor) {
  const id = comoInteiro(valor)
  if (id === null || id <= 0) {
    throw new ErroApi('VALIDACAO', 'Identificador inválido.', 400, { id: 'inválido' })
  }
  return id
}

// DELETE /api/fotos/:id — apaga o registro e o arquivo do disco.
// Operador só remove fotos de checklists criados por ele (regra no serviço).
router.delete(
  '/:id',
  assincrono((req, res) => {
    const id = idDaRota(req.params.id)
    const resultado = removerFoto(id, req.usuario)

    registrar(req, 'remover_foto', 'foto', id, {
      checklist_id: resultado.checklist_id
    })

    ok(res, { removida: true })
  })
)

export default router
