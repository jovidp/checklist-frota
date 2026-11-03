// Regras de dados dos veículos. Esta camada não conhece req/res:
// recebe valores já extraídos e devolve objetos prontos para o JSON.
import { consultar, consultarUm, executar } from '../db/index.js'
import { ErroApi } from '../lib/respostas.js'
import { normalizarPlaca, validarPlaca, comoBooleano, comoInteiro, texto } from '../lib/validacao.js'

const ANO_MINIMO = 1950

// Subconsultas de histórico: evitam JOIN + GROUP BY e mantêm o veículo
// na listagem mesmo quando ele ainda não tem nenhum checklist.
const CAMPOS_LISTA = `
  v.id, v.placa, v.frota, v.modelo, v.marca, v.ano, v.tipo_carroceria,
  v.possui_lona, v.observacoes, v.ativo, v.criado_em, v.atualizado_em,
  (SELECT COUNT(*) FROM checklists c WHERE c.veiculo_id = v.id) AS total_checklists,
  (SELECT MAX(c.data) FROM checklists c WHERE c.veiculo_id = v.id) AS ultimo_checklist
`

/** Converte a linha do banco no objeto público (0/1 viram booleanos). */
function mapear(linha) {
  if (!linha) return null
  return {
    id: linha.id,
    placa: linha.placa,
    frota: linha.frota ?? null,
    modelo: linha.modelo ?? null,
    marca: linha.marca ?? null,
    ano: linha.ano ?? null,
    tipo_carroceria: linha.tipo_carroceria ?? null,
    possui_lona: linha.possui_lona === 1,
    observacoes: linha.observacoes ?? null,
    ativo: linha.ativo === 1,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
    total_checklists: Number(linha.total_checklists ?? 0),
    ultimo_checklist: linha.ultimo_checklist ?? null
  }
}

/** Valida a placa e devolve no formato canônico (maiúsculas, sem separadores). */
function exigirPlacaValida(valor) {
  const placa = normalizarPlaca(valor)
  if (!placa) {
    throw new ErroApi('VALIDACAO', 'Informe a placa do veículo.', 400, {
      placa: 'obrigatório'
    })
  }
  if (!validarPlaca(placa)) {
    throw new ErroApi(
      'VALIDACAO',
      'Placa inválida. Use o formato ABC1234 ou ABC1D23 (Mercosul).',
      400,
      { placa: 'formato inválido' }
    )
  }
  return placa
}

/** Ano é opcional; quando informado precisa ser plausível para um caminhão. */
function anoValido(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const ano = comoInteiro(valor)
  const limite = new Date().getFullYear() + 1
  if (ano === null || ano < ANO_MINIMO || ano > limite) {
    throw new ErroApi('VALIDACAO', `Ano deve estar entre ${ANO_MINIMO} e ${limite}.`, 400, {
      ano: 'fora do intervalo permitido'
    })
  }
  return ano
}

/** Garante que a placa não pertence a outro veículo (409 CONFLITO). */
function garantirPlacaDisponivel(placa, ignorarId = null) {
  const existente = consultarUm(
    'SELECT id FROM veiculos WHERE placa = ? AND id <> ?',
    placa,
    ignorarId ?? 0
  )
  if (existente) {
    throw new ErroApi('CONFLITO', `Já existe um veículo com a placa ${placa}.`, 409, {
      placa: 'já cadastrada'
    })
  }
}

/**
 * Lista veículos com filtros opcionais.
 * `limite`/`offset` chegam já validados pela rota; sem `limite`, devolve tudo.
 */
export function listar(filtros = {}) {
  const { busca = null, ativo = null, limite = null, offset = 0 } = filtros

  const condicoes = []
  const params = []

  if (busca) {
    // A busca por placa ignora hífen/espaço digitados pelo usuário.
    condicoes.push('(v.placa LIKE ? OR v.frota LIKE ? OR v.modelo LIKE ? OR v.marca LIKE ?)')
    const alvo = `%${busca}%`
    params.push(`%${normalizarPlaca(busca)}%`, alvo, alvo, alvo)
  }
  if (ativo !== null && ativo !== undefined) {
    condicoes.push('v.ativo = ?')
    params.push(ativo ? 1 : 0)
  }

  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : ''
  const recorte = limite === null ? '' : 'LIMIT ? OFFSET ?'
  const paramsRecorte = limite === null ? [] : [limite, offset]

  const linhas = consultar(
    `SELECT ${CAMPOS_LISTA} FROM veiculos v ${onde}
     ORDER BY v.ativo DESC, v.placa COLLATE NOCASE ASC
     ${recorte}`,
    ...params,
    ...paramsRecorte
  )

  const total = Number(
    consultarUm(`SELECT COUNT(*) AS total FROM veiculos v ${onde}`, ...params)?.total ?? 0
  )

  return { itens: linhas.map(mapear), total }
}

export function buscarPorId(id) {
  return mapear(consultarUm(`SELECT ${CAMPOS_LISTA} FROM veiculos v WHERE v.id = ?`, id))
}

export function buscarPorPlaca(placa) {
  return mapear(
    consultarUm(`SELECT ${CAMPOS_LISTA} FROM veiculos v WHERE v.placa = ?`, normalizarPlaca(placa))
  )
}

/** Igual ao buscarPorId, mas lança 404 — evita repetir o if em cada rota. */
export function exigirVeiculo(id) {
  const veiculo = buscarPorId(id)
  if (!veiculo) throw new ErroApi('NAO_ENCONTRADO', 'Veículo não encontrado.', 404)
  return veiculo
}

export function temChecklists(id) {
  const linha = consultarUm(
    'SELECT COUNT(*) AS total FROM checklists WHERE veiculo_id = ?',
    id
  )
  return Number(linha?.total ?? 0) > 0
}

export function criar(dados = {}) {
  const placa = exigirPlacaValida(dados.placa)
  garantirPlacaDisponivel(placa)

  const { id } = executar(
    `INSERT INTO veiculos
       (placa, frota, modelo, marca, ano, tipo_carroceria, possui_lona, observacoes, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    placa,
    texto(dados.frota, 30),
    texto(dados.modelo, 80),
    texto(dados.marca, 60),
    anoValido(dados.ano),
    texto(dados.tipo_carroceria, 60),
    comoBooleano(dados.possui_lona, false) ? 1 : 0,
    texto(dados.observacoes, 1000),
    comoBooleano(dados.ativo, true) ? 1 : 0
  )

  return buscarPorId(id)
}

/** Atualização parcial: só os campos presentes no corpo são alterados. */
export function atualizar(id, dados = {}) {
  exigirVeiculo(id)

  const colunas = []
  const params = []

  if (dados.placa !== undefined) {
    const placa = exigirPlacaValida(dados.placa)
    garantirPlacaDisponivel(placa, id)
    colunas.push('placa = ?')
    params.push(placa)
  }

  // Campos de texto livre seguem o mesmo tratamento: aparados e limitados.
  const textos = [
    ['frota', 30],
    ['modelo', 80],
    ['marca', 60],
    ['tipo_carroceria', 60],
    ['observacoes', 1000]
  ]
  for (const [campo, maximo] of textos) {
    if (dados[campo] !== undefined) {
      colunas.push(`${campo} = ?`)
      params.push(texto(dados[campo], maximo))
    }
  }

  if (dados.ano !== undefined) {
    colunas.push('ano = ?')
    params.push(anoValido(dados.ano))
  }

  if (dados.possui_lona !== undefined) {
    colunas.push('possui_lona = ?')
    params.push(comoBooleano(dados.possui_lona, false) ? 1 : 0)
  }

  if (dados.ativo !== undefined) {
    colunas.push('ativo = ?')
    params.push(comoBooleano(dados.ativo, true) ? 1 : 0)
  }

  if (colunas.length === 0) {
    throw new ErroApi('VALIDACAO', 'Nenhum campo informado para atualização.', 400)
  }

  colunas.push("atualizado_em = datetime('now','localtime')")
  executar(`UPDATE veiculos SET ${colunas.join(', ')} WHERE id = ?`, ...params, id)

  return buscarPorId(id)
}

/** Exclusão lógica (ativo = 0): o histórico de checklists precisa do veículo. */
export function desativar(id) {
  const veiculo = exigirVeiculo(id)

  if (!veiculo.ativo) {
    throw new ErroApi('CONFLITO', 'Este veículo já está desativado.', 409)
  }

  executar(
    "UPDATE veiculos SET ativo = 0, atualizado_em = datetime('now','localtime') WHERE id = ?",
    id
  )

  return buscarPorId(id)
}

/**
 * Remoção definitiva — permitida apenas enquanto o veículo não tiver
 * nenhum checklist, para não quebrar o histórico (FK ON DELETE RESTRICT).
 */
export function removerDefinitivo(id) {
  const veiculo = exigirVeiculo(id)

  if (temChecklists(id)) {
    throw new ErroApi(
      'CONFLITO',
      'Este veículo possui checklists registrados e não pode ser excluído. Ele foi apenas desativado.',
      409
    )
  }

  executar('DELETE FROM veiculos WHERE id = ?', id)
  return veiculo
}
