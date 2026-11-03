// Rotas de usuários — seção 2 do docs/API.md.
// Gestão de contas é exclusiva do perfil admin.
import express from 'express'
import { ok, criado, assincrono, ErroApi } from '../lib/respostas.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { registrar } from '../lib/auditoria.js'
import { paginacao, comoBooleano, comoInteiro, texto } from '../lib/validacao.js'
import * as usuarios from '../services/usuarios.service.js'

const router = express.Router()

// Token válido e perfil admin em todas as rotas deste módulo.
router.use(autenticar, exigirPerfil('admin'))

/** Lê e valida o :id da URL. */
function idDaRota(req) {
  const id = comoInteiro(req.params.id)
  if (id === null || id <= 0) {
    throw new ErroApi('VALIDACAO', 'Identificador de usuário inválido.', 400, {
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

// GET /api/usuarios?busca=&perfil=&ativo=&pagina=1&limite=20
router.get(
  '/',
  assincrono((req, res) => {
    const { pagina, limite, offset } = paginacao(req.query)

    const { itens, total } = usuarios.listar({
      busca: texto(req.query.busca, 60),
      perfil: texto(req.query.perfil, 20),
      ativo: filtroAtivo(req.query),
      limite,
      offset
    })

    ok(res, itens, {
      paginacao: { pagina, limite, total, paginas: Math.max(1, Math.ceil(total / limite)) }
    })
  })
)

// GET /api/usuarios/:id
router.get(
  '/:id',
  assincrono((req, res) => {
    ok(res, usuarios.exigirUsuario(idDaRota(req)))
  })
)

// POST /api/usuarios
router.post(
  '/',
  assincrono((req, res) => {
    const { nome, email, senha, perfil } = req.body ?? {}
    const usuario = usuarios.criar({ nome, email, senha, perfil })

    registrar(req, 'criar', 'usuario', usuario.id, {
      email: usuario.email,
      perfil: usuario.perfil
    })
    criado(res, usuario)
  })
)

// PUT /api/usuarios/:id
router.put(
  '/:id',
  assincrono((req, res) => {
    const id = idDaRota(req)
    const { nome, email, senha, perfil, ativo } = req.body ?? {}

    // Só repassamos o que veio no corpo: undefined significa "não alterar".
    const alteracoes = {}
    if (nome !== undefined) alteracoes.nome = nome
    if (email !== undefined) alteracoes.email = email
    if (senha !== undefined) alteracoes.senha = senha
    if (perfil !== undefined) alteracoes.perfil = perfil
    if (ativo !== undefined) alteracoes.ativo = comoBooleano(ativo, true)

    // O serviço barra o admin que tenta se rebaixar ou se desativar.
    const usuario = usuarios.atualizar(id, alteracoes, req.usuario.id)

    registrar(req, 'atualizar', 'usuario', id, {
      email: usuario.email,
      campos: Object.keys(alteracoes).filter((c) => c !== 'senha'),
      senhaAlterada: alteracoes.senha !== undefined
    })
    ok(res, usuario)
  })
)

// DELETE /api/usuarios/:id — exclusão lógica (o histórico referencia o usuário).
router.delete(
  '/:id',
  assincrono((req, res) => {
    const id = idDaRota(req)
    const usuario = usuarios.desativar(id, req.usuario.id)

    registrar(req, 'desativar', 'usuario', id, { email: usuario.email })
    ok(res, usuario)
  })
)

export default router
