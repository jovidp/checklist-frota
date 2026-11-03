// Rotas de veículos — seção 3 do docs/API.md.
// Leitura: qualquer usuário autenticado. Escrita: apenas admin.
import express from 'express'
import { ok, criado, assincrono, ErroApi } from '../lib/respostas.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { registrar } from '../lib/auditoria.js'
import { paginacao, comoBooleano, comoInteiro, texto } from '../lib/validacao.js'
import * as veiculos from '../services/veiculos.service.js'

const router = express.Router()

// Todas as rotas deste módulo exigem token válido.
router.use(autenticar)

const somenteAdmin = exigirPerfil('admin')

/** Lê e valida o :id da URL. */
function idDaRota(req) {
  const id = comoInteiro(req.params.id)
  if (id === null || id <= 0) {
    throw new ErroApi('VALIDACAO', 'Identificador de veículo inválido.', 400, {
      id: 'deve ser um número inteiro positivo'
    })
  }
  return id
}

/**
 * Filtro `ativo` é tri-estado: ausente = todos, 1 = ativos, 0 = inativos.
 * Por isso não usamos direto o padrão de comoBooleano.
 */
function filtroAtivo(query) {
  const bruto = query?.ativo
  if (bruto === undefined || bruto === null || bruto === '') return null
  return comoBooleano(bruto, true)
}

// GET /api/veiculos?busca=&ativo=1&pagina=1&limite=50
router.get(
  '/',
  assincrono((req, res) => {
    const { pagina, limite, offset } = paginacao(req.query)

    const { itens, total } = veiculos.listar({
      busca: texto(req.query.busca, 60),
      ativo: filtroAtivo(req.query),
      limite,
      offset
    })

    ok(res, itens, {
      paginacao: { pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)) }
    })
  })
)

// GET /api/veiculos/:id
router.get(
  '/:id',
  assincrono((req, res) => {
    ok(res, veiculos.exigirVeiculo(idDaRota(req)))
  })
)

// POST /api/veiculos
router.post(
  '/',
  somenteAdmin,
  assincrono((req, res) => {
    const veiculo = veiculos.criar(req.body ?? {})

    registrar(req, 'criar', 'veiculo', veiculo.id, { placa: veiculo.placa })
    criado(res, veiculo)
  })
)

// PUT /api/veiculos/:id
router.put(
  '/:id',
  somenteAdmin,
  assincrono((req, res) => {
    const id = idDaRota(req)
    const veiculo = veiculos.atualizar(id, req.body ?? {})

    registrar(req, 'atualizar', 'veiculo', id, { placa: veiculo.placa })
    ok(res, veiculo)
  })
)

// DELETE /api/veiculos/:id[?definitivo=1]
// Padrão é exclusão lógica; a definitiva só passa se não houver checklists.
router.delete(
  '/:id',
  somenteAdmin,
  assincrono((req, res) => {
    const id = idDaRota(req)

    if (comoBooleano(req.query.definitivo, false)) {
      const removido = veiculos.removerDefinitivo(id)
      registrar(req, 'remover', 'veiculo', id, { placa: removido.placa, definitivo: true })
      return ok(res, { removido: true, definitivo: true, placa: removido.placa })
    }

    const veiculo = veiculos.desativar(id)
    registrar(req, 'desativar', 'veiculo', id, { placa: veiculo.placa })
    ok(res, veiculo)
  })
)

export default router
