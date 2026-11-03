// Regras de dados dos usuários. Esta camada não conhece req/res:
// recebe valores já extraídos e devolve objetos prontos para o JSON.
import { consultar, consultarUm, executar } from '../db/index.js'
import { gerarHash } from '../lib/senha.js'
import { ErroApi } from '../lib/respostas.js'
import { validarEmail, texto } from '../lib/validacao.js'

const PERFIS = ['admin', 'operador']
const SENHA_MINIMA = 6

// senha_hash jamais entra nesta lista — é o que garante que o hash
// nunca escape por engano em uma resposta da API.
const CAMPOS_PUBLICOS = 'id, nome, email, perfil, ativo, criado_em, atualizado_em'

/** Converte a linha do banco no objeto público (ativo vira booleano). */
function mapear(linha) {
  if (!linha) return null
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    ativo: linha.ativo === 1,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em
  }
}

function normalizarEmail(valor) {
  return String(valor ?? '').trim().toLowerCase()
}

/** Valida e devolve o nome já aparado. */
function exigirNome(valor) {
  const nome = texto(valor, 120)
  if (!nome || nome.length < 2) {
    throw new ErroApi('VALIDACAO', 'Informe o nome do usuário.', 400, {
      nome: 'mínimo de 2 caracteres'
    })
  }
  return nome
}

/** Valida e devolve o e-mail já normalizado. */
function exigirEmailValido(valor) {
  const email = normalizarEmail(valor)
  if (!validarEmail(email)) {
    throw new ErroApi('VALIDACAO', 'Informe um e-mail válido.', 400, {
      email: 'formato inválido'
    })
  }
  return email
}

function exigirPerfilValido(valor) {
  const perfil = String(valor ?? '').trim().toLowerCase()
  if (!PERFIS.includes(perfil)) {
    throw new ErroApi('VALIDACAO', 'Perfil deve ser "admin" ou "operador".', 400, {
      perfil: 'valor inválido'
    })
  }
  return perfil
}

/** Regra única de senha, usada na criação, na atualização e na troca. */
export function validarSenha(valor, campo = 'senha') {
  if (typeof valor !== 'string' || valor.length < SENHA_MINIMA) {
    throw new ErroApi(
      'VALIDACAO',
      `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`,
      400,
      { [campo]: `mínimo de ${SENHA_MINIMA} caracteres` }
    )
  }
  return valor
}

/** Garante que o e-mail não pertence a outro usuário (409 CONFLITO). */
function garantirEmailDisponivel(email, ignorarId = null) {
  const existente = consultarUm(
    'SELECT id FROM usuarios WHERE email = ? AND id <> ?',
    email,
    ignorarId ?? 0
  )
  if (existente) {
    throw new ErroApi('CONFLITO', 'Já existe um usuário com este e-mail.', 409, {
      email: 'já cadastrado'
    })
  }
}

export function contarAdminsAtivos() {
  const linha = consultarUm(
    "SELECT COUNT(*) AS total FROM usuarios WHERE perfil = 'admin' AND ativo = 1"
  )
  return Number(linha?.total ?? 0)
}

/**
 * Impede deixar o sistema sem nenhum administrador ativo.
 * `id` é o usuário que está perdendo o acesso de admin.
 */
function garantirOutroAdminAtivo(id, acao) {
  const atual = consultarUm('SELECT perfil, ativo FROM usuarios WHERE id = ?', id)
  const eraAdminAtivo = atual?.perfil === 'admin' && atual?.ativo === 1
  if (eraAdminAtivo && contarAdminsAtivos() <= 1) {
    throw new ErroApi(
      'CONFLITO',
      `Não é possível ${acao}: este é o último administrador ativo do sistema.`,
      409
    )
  }
}

/**
 * Lista usuários com filtros opcionais.
 * `limite`/`offset` são numéricos já validados pela rota; quando ausentes,
 * devolve a lista completa.
 */
export function listar(filtros = {}) {
  const { busca = null, perfil = null, ativo = null, limite = null, offset = 0 } = filtros

  const condicoes = []
  const params = []

  if (busca) {
    condicoes.push('(nome LIKE ? OR email LIKE ?)')
    const alvo = `%${busca}%`
    params.push(alvo, alvo)
  }
  if (perfil) {
    condicoes.push('perfil = ?')
    params.push(exigirPerfilValido(perfil))
  }
  if (ativo !== null && ativo !== undefined) {
    condicoes.push('ativo = ?')
    params.push(ativo ? 1 : 0)
  }

  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : ''
  const paginacao = limite === null ? '' : 'LIMIT ? OFFSET ?'
  const paramsPagina = limite === null ? [] : [limite, offset]

  const linhas = consultar(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuarios ${onde}
     ORDER BY ativo DESC, nome COLLATE NOCASE ASC
     ${paginacao}`,
    ...params,
    ...paramsPagina
  )

  const total = Number(
    consultarUm(`SELECT COUNT(*) AS total FROM usuarios ${onde}`, ...params)?.total ?? 0
  )

  return { itens: linhas.map(mapear), total }
}

export function buscarPorId(id) {
  return mapear(consultarUm(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`, id))
}

/** Igual ao buscarPorId, mas lança 404 — evita repetir o if em cada rota. */
export function exigirUsuario(id) {
  const usuario = buscarPorId(id)
  if (!usuario) throw new ErroApi('NAO_ENCONTRADO', 'Usuário não encontrado.', 404)
  return usuario
}

/**
 * USO INTERNO — único ponto que devolve senha_hash.
 * Serve ao login e à conferência da senha atual; nunca vá direto ao JSON.
 */
export function buscarPorEmail(email) {
  return consultarUm(
    `SELECT id, nome, email, senha_hash, perfil, ativo, senha_provisoria
       FROM usuarios WHERE email = ?`,
    normalizarEmail(email)
  )
}

export function criar({ nome, email, senha, perfil = 'operador' } = {}) {
  const dados = {
    nome: exigirNome(nome),
    email: exigirEmailValido(email),
    perfil: exigirPerfilValido(perfil)
  }
  validarSenha(senha)
  garantirEmailDisponivel(dados.email)

  const { id } = executar(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)`,
    dados.nome,
    dados.email,
    gerarHash(senha),
    dados.perfil
  )

  return buscarPorId(id)
}

/**
 * Atualização parcial: só os campos presentes no corpo são alterados.
 * `solicitanteId` protege o admin logado de se rebaixar ou se desativar.
 */
export function atualizar(id, dados = {}, solicitanteId = null) {
  exigirUsuario(id)

  const colunas = []
  const params = []

  if (dados.nome !== undefined) {
    colunas.push('nome = ?')
    params.push(exigirNome(dados.nome))
  }

  if (dados.email !== undefined) {
    const email = exigirEmailValido(dados.email)
    garantirEmailDisponivel(email, id)
    colunas.push('email = ?')
    params.push(email)
  }

  if (dados.senha !== undefined && dados.senha !== null && dados.senha !== '') {
    validarSenha(dados.senha)
    colunas.push('senha_hash = ?')
    params.push(gerarHash(dados.senha))
  }

  if (dados.perfil !== undefined) {
    const perfil = exigirPerfilValido(dados.perfil)
    if (perfil !== 'admin') {
      if (Number(id) === Number(solicitanteId)) {
        throw new ErroApi('CONFLITO', 'Você não pode alterar o seu próprio perfil.', 409)
      }
      garantirOutroAdminAtivo(id, 'rebaixar o perfil')
    }
    colunas.push('perfil = ?')
    params.push(perfil)
  }

  if (dados.ativo !== undefined) {
    const ativo = dados.ativo ? 1 : 0
    if (ativo === 0) {
      if (Number(id) === Number(solicitanteId)) {
        throw new ErroApi('CONFLITO', 'Você não pode desativar o seu próprio usuário.', 409)
      }
      garantirOutroAdminAtivo(id, 'desativar este usuário')
    }
    colunas.push('ativo = ?')
    params.push(ativo)
  }

  if (colunas.length === 0) {
    throw new ErroApi('VALIDACAO', 'Nenhum campo informado para atualização.', 400)
  }

  colunas.push("atualizado_em = datetime('now','localtime')")
  executar(`UPDATE usuarios SET ${colunas.join(', ')} WHERE id = ?`, ...params, id)

  return buscarPorId(id)
}

/** Exclusão lógica (ativo = 0). Nunca apagamos: há checklists referenciando. */
export function desativar(id, solicitanteId = null) {
  const usuario = exigirUsuario(id)

  if (Number(id) === Number(solicitanteId)) {
    throw new ErroApi('CONFLITO', 'Você não pode desativar o seu próprio usuário.', 409)
  }
  if (!usuario.ativo) {
    throw new ErroApi('CONFLITO', 'Este usuário já está desativado.', 409)
  }
  garantirOutroAdminAtivo(id, 'desativar este usuário')

  executar(
    "UPDATE usuarios SET ativo = 0, atualizado_em = datetime('now','localtime') WHERE id = ?",
    id
  )

  return buscarPorId(id)
}

export function alterarSenha(id, senhaNova) {
  exigirUsuario(id)
  validarSenha(senhaNova, 'senhaNova')

  // Trocar a senha encerra a provisoriedade e libera o resto do sistema.
  executar(
    `UPDATE usuarios
        SET senha_hash = ?, senha_provisoria = 0,
            atualizado_em = datetime('now','localtime')
      WHERE id = ?`,
    gerarHash(senhaNova),
    id
  )

  return true
}
