// Consultas agregadas para os relatórios e para a exportação.
// Esta camada não conhece req/res: recebe valores já extraídos
// e devolve objetos prontos para virar JSON (ou linhas de CSV).
import { consultar, consultarUm } from '../db/index.js'
import { ErroApi } from '../lib/respostas.js'
import { validarData, normalizarPlaca, validarPlaca } from '../lib/validacao.js'

// Janela padrão dos relatórios quando o cliente não informa o período.
const DIAS_PADRAO = 30
// Antecedência considerada nos alertas de vencimento de documentos.
const DIAS_ALERTA = 30
// Teto de segurança da exportação: evita montar um CSV gigante na memória
// caso alguém peça um período de vários anos.
const MAX_LINHAS_CSV = 10000

const MS_POR_DIA = 86400000

/** Data de hoje no fuso local, no formato AAAA-MM-DD (mesmo formato do banco). */
function hoje() {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Soma (ou subtrai) dias de uma data AAAA-MM-DD. Cálculo em UTC evita horário de verão. */
function somarDias(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia) + dias * MS_POR_DIA)
  return d.toISOString().slice(0, 10)
}

/** Diferença em dias entre duas datas AAAA-MM-DD (positivo = "alvo" no futuro). */
function diferencaEmDias(alvo, base) {
  const [a1, m1, d1] = alvo.split('-').map(Number)
  const [a2, m2, d2] = base.split('-').map(Number)
  return Math.round((Date.UTC(a1, m1 - 1, d1) - Date.UTC(a2, m2 - 1, d2)) / MS_POR_DIA)
}

/**
 * Normaliza o período dos relatórios.
 * Sem "de"/"ate" usamos os últimos 30 dias, incluindo hoje.
 */
export function resolverPeriodo({ de, ate } = {}) {
  const campos = {}
  const temDe = de !== null && de !== undefined && String(de).trim() !== ''
  const temAte = ate !== null && ate !== undefined && String(ate).trim() !== ''

  if (temDe && !validarData(String(de).trim())) campos.de = 'use o formato AAAA-MM-DD'
  if (temAte && !validarData(String(ate).trim())) campos.ate = 'use o formato AAAA-MM-DD'
  if (Object.keys(campos).length > 0) {
    throw new ErroApi('VALIDACAO', 'Datas do período inválidas.', 400, campos)
  }

  const fim = temAte ? String(ate).trim() : hoje()
  const inicio = temDe ? String(de).trim() : somarDias(fim, -(DIAS_PADRAO - 1))

  if (inicio > fim) {
    throw new ErroApi(
      'VALIDACAO',
      'A data inicial não pode ser posterior à data final.',
      400,
      { de: 'posterior à data final' }
    )
  }

  return { de: inicio, ate: fim }
}

/** Placa é filtro opcional; quando vier, precisa ser uma placa válida. */
function resolverPlaca(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return ''
  const placa = normalizarPlaca(valor)
  if (!validarPlaca(placa)) {
    throw new ErroApi('VALIDACAO', 'Placa inválida.', 400, { placa: 'formato inválido' })
  }
  return placa
}

/** SUM() devolve null quando não há linhas — normalizamos para número. */
function inteiro(valor) {
  return Number(valor ?? 0)
}

// ---------------------------------------------------------------------------
// 7.1 Resumo do período
// ---------------------------------------------------------------------------
export function resumo({ de, ate } = {}) {
  const periodo = resolverPeriodo({ de, ate })

  const totais = consultarUm(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'APROVADO'  THEN 1 ELSE 0 END) AS aprovados,
       SUM(CASE WHEN status = 'RESTRICAO' THEN 1 ELSE 0 END) AS restricoes,
       SUM(CASE WHEN status = 'REPROVADO' THEN 1 ELSE 0 END) AS reprovados
     FROM checklists
     WHERE data BETWEEN ? AND ?`,
    periodo.de,
    periodo.ate
  )

  // Frota ativa hoje — independe do período consultado.
  const frota = consultarUm('SELECT COUNT(*) AS total FROM veiculos WHERE ativo = 1')

  const naoConformes = consultarUm(
    `SELECT COUNT(*) AS total
     FROM checklist_itens ci
     JOIN checklists c ON c.id = ci.checklist_id
     WHERE ci.status = 'NC' AND c.data BETWEEN ? AND ?`,
    periodo.de,
    periodo.ate
  )

  const porDia = consultar(
    `SELECT data, COUNT(*) AS total
     FROM checklists
     WHERE data BETWEEN ? AND ?
     GROUP BY data
     ORDER BY data ASC`,
    periodo.de,
    periodo.ate
  )

  const porStatus = consultar(
    `SELECT status, COUNT(*) AS total
     FROM checklists
     WHERE data BETWEEN ? AND ?
     GROUP BY status
     ORDER BY total DESC, status ASC`,
    periodo.de,
    periodo.ate
  )

  return {
    periodo,
    total_checklists: inteiro(totais?.total),
    aprovados: inteiro(totais?.aprovados),
    restricoes: inteiro(totais?.restricoes),
    reprovados: inteiro(totais?.reprovados),
    veiculos_ativos: inteiro(frota?.total),
    total_nao_conformidades: inteiro(naoConformes?.total),
    por_dia: porDia.map((l) => ({ data: l.data, total: inteiro(l.total) })),
    por_status: porStatus.map((l) => ({ status: l.status, total: inteiro(l.total) }))
  }
}

// ---------------------------------------------------------------------------
// 7.2 Ranking dos itens que mais reprovam
// ---------------------------------------------------------------------------
export function naoConformidades({ de, ate, limite = 10 } = {}) {
  const periodo = resolverPeriodo({ de, ate })
  const quantos = Math.min(100, Math.max(1, Number(limite) || 10))

  const linhas = consultar(
    `SELECT ic.chave, ic.nome, ic.critico, COUNT(*) AS total
     FROM checklist_itens ci
     JOIN checklists c      ON c.id = ci.checklist_id
     JOIN itens_catalogo ic ON ic.chave = ci.item_chave
     WHERE ci.status = 'NC' AND c.data BETWEEN ? AND ?
     GROUP BY ic.chave, ic.nome, ic.critico
     ORDER BY total DESC, ic.ordem ASC
     LIMIT ?`,
    periodo.de,
    periodo.ate,
    quantos
  )

  return linhas.map((l) => ({
    chave: l.chave,
    nome: l.nome,
    critico: l.critico === 1,
    total: inteiro(l.total)
  }))
}

// ---------------------------------------------------------------------------
// 7.3 Consolidado por veículo
// ---------------------------------------------------------------------------
export function porVeiculo({ de, ate } = {}) {
  const periodo = resolverPeriodo({ de, ate })

  const linhas = consultar(
    `SELECT
       v.id AS veiculo_id,
       v.placa,
       v.frota,
       COUNT(c.id) AS total,
       SUM(CASE WHEN c.status = 'REPROVADO' THEN 1 ELSE 0 END) AS reprovados,
       SUM(c.total_nc) AS nc,
       MAX(c.data) AS ultimo
     FROM checklists c
     JOIN veiculos v ON v.id = c.veiculo_id
     WHERE c.data BETWEEN ? AND ?
     GROUP BY v.id, v.placa, v.frota
     ORDER BY total DESC, v.placa ASC`,
    periodo.de,
    periodo.ate
  )

  return linhas.map((l) => ({
    veiculo_id: l.veiculo_id,
    placa: l.placa,
    frota: l.frota,
    total: inteiro(l.total),
    reprovados: inteiro(l.reprovados),
    nc: inteiro(l.nc),
    ultimo: l.ultimo
  }))
}

// ---------------------------------------------------------------------------
// 7.4 Alertas de vencimento de documentos
// ---------------------------------------------------------------------------
const DOCUMENTOS = [
  { campo: 'crlv_validade', documento: 'CRLV' },
  { campo: 'tacografo_validade', documento: 'Tacógrafo' }
]

/**
 * Vencimentos com base no ÚLTIMO checklist de cada veículo ativo:
 * é o registro mais recente que temos da documentação daquele veículo.
 * Retorna vencidos (dias negativo) e a vencer em até 30 dias.
 */
export function alertas() {
  const referencia = hoje()

  const linhas = consultar(
    `SELECT
       v.id AS veiculo_id,
       v.placa,
       c.crlv_validade,
       c.tacografo_validade
     FROM veiculos v
     JOIN checklists c ON c.id = (
       SELECT c2.id FROM checklists c2
       WHERE c2.veiculo_id = v.id
       ORDER BY c2.data DESC, c2.id DESC
       LIMIT 1
     )
     WHERE v.ativo = 1`
  )

  const resultado = []
  for (const linha of linhas) {
    for (const { campo, documento } of DOCUMENTOS) {
      const validade = linha[campo]
      // Sem data registrada não há vencimento a alertar.
      if (!validade || !validarData(validade)) continue

      const dias = diferencaEmDias(validade, referencia)
      if (dias > DIAS_ALERTA) continue

      resultado.push({
        veiculo_id: linha.veiculo_id,
        placa: linha.placa,
        documento,
        validade,
        dias,
        vencido: dias < 0
      })
    }
  }

  // Mais urgente primeiro (vencidos há mais tempo no topo).
  resultado.sort((a, b) => a.dias - b.dias || a.placa.localeCompare(b.placa, 'pt-BR'))
  return resultado
}

// ---------------------------------------------------------------------------
// 8. Dados brutos da exportação em CSV
// ---------------------------------------------------------------------------
/**
 * Devolve o catálogo (define as colunas dinâmicas) e uma linha por checklist,
 * já com as respostas indexadas por chave de item.
 */
export function dadosParaCsv({ de, ate, placa } = {}) {
  const periodo = resolverPeriodo({ de, ate })
  const filtroPlaca = resolverPlaca(placa)

  // A ordem do catálogo é a ordem das colunas no arquivo.
  const catalogo = consultar(
    `SELECT chave, nome FROM itens_catalogo
     WHERE ativo = 1
     ORDER BY ordem ASC, id ASC`
  )

  const checklists = consultar(
    `SELECT
       c.id, c.data, c.hora, c.km, c.status, c.aprovacao,
       c.crlv_validade, c.tacografo_validade,
       c.lona_possui, c.lona_condicao, c.lona_obs,
       c.obs_geral,
       v.placa, v.frota,
       u.nome AS responsavel,
       (SELECT COUNT(*) FROM fotos f WHERE f.checklist_id = c.id) AS total_fotos
     FROM checklists c
     JOIN veiculos v ON v.id = c.veiculo_id
     JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.data BETWEEN ? AND ?
       AND (? = '' OR v.placa = ?)
     ORDER BY c.data ASC, c.hora ASC, c.id ASC
     LIMIT ?`,
    periodo.de,
    periodo.ate,
    filtroPlaca,
    filtroPlaca,
    MAX_LINHAS_CSV
  )

  // Uma única consulta traz as respostas de todos os checklists do período.
  const respostas = consultar(
    `SELECT ci.checklist_id, ci.item_chave, ci.status, ci.observacao
     FROM checklist_itens ci
     JOIN checklists c ON c.id = ci.checklist_id
     JOIN veiculos v   ON v.id = c.veiculo_id
     WHERE c.data BETWEEN ? AND ?
       AND (? = '' OR v.placa = ?)`,
    periodo.de,
    periodo.ate,
    filtroPlaca,
    filtroPlaca
  )

  const porChecklist = new Map()
  for (const r of respostas) {
    let mapa = porChecklist.get(r.checklist_id)
    if (!mapa) {
      mapa = new Map()
      porChecklist.set(r.checklist_id, mapa)
    }
    mapa.set(r.item_chave, { status: r.status, observacao: r.observacao })
  }

  const linhas = checklists.map((c) => {
    const mapa = porChecklist.get(c.id) ?? new Map()
    const itens = {}
    for (const item of catalogo) {
      const resposta = mapa.get(item.chave)
      itens[item.chave] = {
        status: resposta?.status ?? 'PEND',
        observacao: resposta?.observacao ?? ''
      }
    }

    return {
      id: c.id,
      data: c.data,
      hora: c.hora,
      placa: c.placa,
      frota: c.frota,
      km: c.km,
      responsavel: c.responsavel,
      status: c.status,
      aprovacao: c.aprovacao,
      crlv_validade: c.crlv_validade,
      tacografo_validade: c.tacografo_validade,
      lona_possui: c.lona_possui === 1,
      lona_condicao: c.lona_condicao,
      lona_obs: c.lona_obs,
      obs_geral: c.obs_geral,
      total_fotos: inteiro(c.total_fotos),
      itens
    }
  })

  return { periodo, placa: filtroPlaca || null, catalogo, linhas }
}
