// Rotas de checklists — montadas em /api/checklists.
// Toda a regra de negócio vive em services/checklists.service.js; aqui só
// extraímos a entrada, chamamos o serviço e formatamos a resposta.
import { Router } from 'express'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { ok, criado, assincrono, ErroApi } from '../lib/respostas.js'
import { paginacao, comoInteiro, texto } from '../lib/validacao.js'
import { registrar } from '../lib/auditoria.js'
import {
  listar,
  buscarCompleto,
  criar,
  atualizar,
  remover,
  adicionarFoto,
  listarFotos
} from '../services/checklists.service.js'

const router = Router()

// Nenhuma rota de checklist é pública.
router.use(autenticar)

/** Converte o :id da URL em inteiro positivo ou recusa a requisição. */
function idDaRota(valor) {
  const id = comoInteiro(valor)
  if (id === null || id <= 0) {
    throw new ErroApi('VALIDACAO', 'Identificador inválido.', 400, { id: 'inválido' })
  }
  return id
}

// GET /api/checklists?placa=&veiculo_id=&de=&ate=&status=&busca=&pagina=&limite=
router.get(
  '/',
  assincrono((req, res) => {
    const { pagina, limite, offset } = paginacao(req.query)

    const { itens, total } = listar({
      placa: texto(req.query.placa, 10),
      veiculo_id: req.query.veiculo_id,
      de: req.query.de,
      ate: req.query.ate,
      status: texto(req.query.status, 20),
      busca: texto(req.query.busca, 80),
      limite,
      offset
    })

    ok(res, itens, {
      paginacao: {
        pagina,
        limite,
        total,
        paginas: Math.max(1, Math.ceil(total / limite))
      }
    })
  })
)

// POST /api/checklists — cria cabeçalho, itens e fotos em uma transação.
router.post(
  '/',
  assincrono((req, res) => {
    const checklist = criar(req.body, req.usuario)

    registrar(req, 'criar', 'checklist', checklist.id, {
      veiculo_id: checklist.veiculo.id,
      placa: checklist.veiculo.placa,
      status: checklist.status,
      aprovacao: checklist.aprovacao,
      fotos: checklist.fotos.length
    })

    criado(res, checklist)
  })
)

// GET /api/checklists/:id — objeto completo.
router.get(
  '/:id',
  assincrono((req, res) => {
    const checklist = buscarCompleto(idDaRota(req.params.id))
    if (!checklist) {
      throw new ErroApi('NAO_ENCONTRADO', 'Checklist não encontrado.', 404)
    }
    ok(res, checklist)
  })
)

// PUT /api/checklists/:id — operador só edita o que criou.
router.put(
  '/:id',
  assincrono((req, res) => {
    const id = idDaRota(req.params.id)
    const checklist = atualizar(id, req.body, req.usuario)

    registrar(req, 'atualizar', 'checklist', checklist.id, {
      veiculo_id: checklist.veiculo.id,
      status: checklist.status,
      aprovacao: checklist.aprovacao
    })

    ok(res, checklist)
  })
)

// DELETE /api/checklists/:id — somente admin; apaga itens, fotos e arquivos.
router.delete(
  '/:id',
  exigirPerfil('admin'),
  assincrono((req, res) => {
    const id = idDaRota(req.params.id)
    const resultado = remover(id, req.usuario)

    registrar(req, 'remover', 'checklist', id, {
      total_fotos: resultado.total_fotos
    })

    ok(res, { removido: true })
  })
)

// POST /api/checklists/:id/fotos — anexa uma foto (base64 ou data URL).
router.post(
  '/:id/fotos',
  assincrono((req, res) => {
    const id = idDaRota(req.params.id)
    const foto = adicionarFoto(id, req.body, req.usuario)

    registrar(req, 'adicionar_foto', 'foto', foto.id, {
      checklist_id: id,
      item_chave: foto.item_chave
    })

    criado(res, foto)
  })
)

// GET /api/checklists/:id/fotos — lista as fotos do checklist.
router.get(
  '/:id/fotos',
  assincrono((req, res) => {
    ok(res, listarFotos(idDaRota(req.params.id)))
  })
)

export default router
