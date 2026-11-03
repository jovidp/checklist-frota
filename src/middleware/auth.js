// Autenticação por JWT (Bearer) e controle de perfil.
import { verificar } from '../lib/jwt.js'
import { consultarUm } from '../db/index.js'
import { ErroApi } from '../lib/respostas.js'

/** Lê o token do header Authorization: Bearer <token>. */
function extrairToken(req) {
  const cabecalho = req.headers?.authorization ?? ''
  const [tipo, valor] = cabecalho.split(' ')
  if (!valor || tipo.toLowerCase() !== 'bearer') return null
  return valor.trim()
}

/**
 * Recarrega o usuário do banco a cada requisição: assim a desativação de
 * uma conta tem efeito imediato, sem esperar o token expirar.
 */
function carregarUsuario(id) {
  const usuario = consultarUm(
    'SELECT id, nome, email, perfil, ativo, senha_provisoria FROM usuarios WHERE id = ?',
    id
  )
  if (!usuario || usuario.ativo !== 1) return null
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    senhaProvisoria: usuario.senha_provisoria === 1
  }
}

export function autenticar(req, res, next) {
  try {
    const token = extrairToken(req)
    if (!token) {
      throw new ErroApi('NAO_AUTENTICADO', 'Faça login para continuar.', 401)
    }

    const carga = verificar(token) // lança ErroApi 401 se inválido/expirado
    const usuario = carregarUsuario(carga.sub ?? carga.id)
    if (!usuario) {
      throw new ErroApi('NAO_AUTENTICADO', 'Usuário inativo ou inexistente.', 401)
    }

    req.usuario = usuario
    next()
  } catch (erro) {
    next(erro)
  }
}

/**
 * Barra quem ainda usa a senha provisória da carga inicial: só as rotas de
 * /api/auth ficam liberadas, o suficiente para trocar a senha e seguir.
 * Sem token válido não bloqueia nada — a rota destino devolve o 401.
 */
export function exigirSenhaDefinitiva(req, res, next) {
  if (req.usuario?.senhaProvisoria) {
    return next(
      new ErroApi(
        'SENHA_PROVISORIA',
        'Troque a senha provisória antes de usar o sistema.',
        403
      )
    )
  }
  next()
}

/** exigirPerfil('admin') — use sempre depois de autenticar. */
export function exigirPerfil(...perfis) {
  const permitidos = perfis.flat()
  return function (req, res, next) {
    if (!req.usuario) {
      return next(new ErroApi('NAO_AUTENTICADO', 'Faça login para continuar.', 401))
    }
    if (!permitidos.includes(req.usuario.perfil)) {
      return next(
        new ErroApi('SEM_PERMISSAO', 'Seu perfil não permite esta ação.', 403)
      )
    }
    next()
  }
}

/** Autenticação opcional: identifica quem enviou token válido, sem bloquear. */
export function opcional(req, res, next) {
  try {
    const token = extrairToken(req)
    if (token) {
      const carga = verificar(token)
      req.usuario = carregarUsuario(carga.sub ?? carga.id) ?? undefined
    }
  } catch {
    // Token ruim em rota opcional é tratado como visitante anônimo.
    req.usuario = undefined
  }
  next()
}
