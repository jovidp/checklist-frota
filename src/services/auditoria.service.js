// Consulta da trilha de auditoria.
//
// A GRAVAÇÃO fica em lib/auditoria.js. Aqui só existe leitura, de propósito:
// a API não expõe nenhuma forma de criar, editar ou apagar um registro de
// auditoria. Uma trilha que o próprio sistema consegue reescrever não serve
// como prova de nada.
import { consultar, consultarUm } from '../db/index.js'
import { ErroApi } from '../lib/respostas.js'
import { comoInteiro, texto, validarData } from '../lib/validacao.js'

// LEFT JOIN: usuario_id é nulo nas tentativas de login que falharam (ninguém
// estava autenticado) e vira nulo se a conta for excluída (ON DELETE SET NULL).
const SELECT_BASE = `
  FROM auditoria a
  LEFT JOIN usuarios u ON u.id = a.usuario_id`

/** Data ISO opcional: vazio vira null, formato errado vira 400. */
function dataOpcional(valor, campo) {
  const bruto = texto(valor, 10)
  if (bruto === null) return null
  if (!validarData(bruto)) {
    throw new ErroApi('VALIDACAO', `Data inválida em "${campo}". Use AAAA-MM-DD.`, 400, {
      [campo]: 'data inválida'
    })
  }
  return bruto
}

/**
 * O `detalhe` foi gravado como JSON pela lib, mas aceita texto puro.
 * Devolvemos objeto quando dá, e a string crua quando não dá — nunca
 * derrubamos a listagem inteira por causa de um registro malformado.
 */
function detalheLegivel(bruto) {
  if (bruto === null || bruto === undefined || bruto === '') return null
  try {
    return JSON.parse(bruto)
  } catch {
    return bruto
  }
}

function mapear(linha) {
  if (!linha) return null
  return {
    id: linha.id,
    acao: linha.acao,
    entidade: linha.entidade,
    entidade_id: linha.entidade_id,
    detalhe: detalheLegivel(linha.detalhe),
    ip: linha.ip,
    criado_em: linha.criado_em,
    // Sem usuário: ou a tentativa de login falhou antes de autenticar,
    // ou a conta foi removida depois do fato.
    usuario: linha.usuario_id
      ? { id: linha.usuario_id, nome: linha.usuario_nome, email: linha.usuario_email }
      : null
  }
}

/**
 * Listagem filtrada, mais recentes primeiro.
 * `limite`/`offset` já chegam validados pela rota.
 */
export function listar(filtros = {}) {
  const {
    busca = null,
    acao = null,
    entidade = null,
    usuario_id = null,
    de = null,
    ate = null,
    limite = 50,
    offset = 0
  } = filtros

  const condicoes = []
  const params = []

  if (acao) {
    condicoes.push('a.acao = ?')
    params.push(String(acao).trim())
  }

  if (entidade) {
    condicoes.push('a.entidade = ?')
    params.push(String(entidade).trim())
  }

  if (usuario_id !== null && usuario_id !== undefined && usuario_id !== '') {
    const id = comoInteiro(usuario_id)
    if (id === null) {
      throw new ErroApi('VALIDACAO', 'Filtro de usuário inválido.', 400, {
        usuario_id: 'valor inválido'
      })
    }
    condicoes.push('a.usuario_id = ?')
    params.push(id)
  }

  // criado_em é 'AAAA-MM-DD HH:MM:SS'; date() isola o dia para o intervalo
  // pegar o dia inteiro do "até", e não só a meia-noite dele.
  const dataDe = dataOpcional(de, 'de')
  if (dataDe) {
    condicoes.push('date(a.criado_em) >= ?')
    params.push(dataDe)
  }

  const dataAte = dataOpcional(ate, 'ate')
  if (dataAte) {
    condicoes.push('date(a.criado_em) <= ?')
    params.push(dataAte)
  }

  if (busca) {
    // O detalhe entra na busca para achar por e-mail ou placa citados nele.
    condicoes.push(`(
      u.nome LIKE ? OR u.email LIKE ? OR a.acao LIKE ?
      OR a.entidade LIKE ? OR a.ip LIKE ? OR a.detalhe LIKE ?
    )`)
    const alvo = `%${String(busca).trim()}%`
    params.push(alvo, alvo, alvo, alvo, alvo, alvo)
  }

  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : ''

  const linhas = consultar(
    `SELECT a.id, a.usuario_id, a.acao, a.entidade, a.entidade_id,
            a.detalhe, a.ip, a.criado_em,
            u.nome AS usuario_nome, u.email AS usuario_email
     ${SELECT_BASE}
     ${onde}
     ORDER BY a.criado_em DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limite,
    offset
  )

  const total = Number(
    consultarUm(`SELECT COUNT(*) AS total ${SELECT_BASE} ${onde}`, ...params)?.total ?? 0
  )

  return { itens: linhas.map(mapear), total }
}

/**
 * Valores que realmente existem na trilha, para montar os filtros da tela.
 * Preferimos isto a uma lista fixa no código: ações novas aparecem sozinhas,
 * e nenhuma opção fica na tela sem ter registro correspondente.
 */
export function opcoesDeFiltro() {
  const acoes = consultar(
    `SELECT acao, COUNT(*) AS total FROM auditoria
      GROUP BY acao ORDER BY total DESC, acao ASC`
  )
  const entidades = consultar(
    `SELECT entidade, COUNT(*) AS total FROM auditoria
      GROUP BY entidade ORDER BY total DESC, entidade ASC`
  )
  const usuarios = consultar(
    `SELECT u.id, u.nome, COUNT(*) AS total
       FROM auditoria a JOIN usuarios u ON u.id = a.usuario_id
      GROUP BY u.id, u.nome ORDER BY total DESC, u.nome ASC`
  )

  return {
    acoes: acoes.map((l) => ({ valor: l.acao, total: Number(l.total) })),
    entidades: entidades.map((l) => ({ valor: l.entidade, total: Number(l.total) })),
    usuarios: usuarios.map((l) => ({ id: l.id, nome: l.nome, total: Number(l.total) })),
    total: Number(consultarUm('SELECT COUNT(*) AS total FROM auditoria')?.total ?? 0)
  }
}
