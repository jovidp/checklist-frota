// Exportação em CSV — /api/exportar (autenticada).
// Formato pensado para o Excel pt-BR: BOM UTF-8, separador ";", quebra CRLF
// e datas em DD/MM/AAAA.
import express from 'express'
import { assincrono } from '../lib/respostas.js'
import { autenticar } from '../middleware/auth.js'
import { registrar } from '../lib/auditoria.js'
import * as relatorios from '../services/relatorios.service.js'

const router = express.Router()

const BOM = '\uFEFF'
const SEPARADOR = ';'
const QUEBRA = '\r\n'

// Status dos itens e do checklist saem por extenso: o arquivo é lido por pessoas.
const STATUS_ITEM = {
  OK: 'Conforme',
  NC: 'Não conforme',
  NA: 'N/A',
  PEND: 'Não informado'
}

const SITUACAO = {
  APROVADO: 'Aprovado',
  RESTRICAO: 'Restrição',
  REPROVADO: 'Reprovado'
}

// Decisão final do responsável — registros antigos, anteriores ao campo,
// saem como "Não informado".
const APROVACAO = {
  APROVADO: 'Aprovado',
  REPROVADO: 'Não aprovado'
}

const CONDICAO_LONA = { BOA: 'Boa', RUIM: 'Ruim' }

/** Toda célula vai entre aspas; aspas internas são duplicadas (RFC 4180). */
function celula(valor) {
  const t = valor === null || valor === undefined ? '' : String(valor)
  return `"${t.replace(/"/g, '""')}"`
}

function linhaCsv(valores) {
  return valores.map(celula).join(SEPARADOR)
}

/** AAAA-MM-DD -> DD/MM/AAAA. Valor ausente ou fora do padrão vira célula vazia. */
function dataBr(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Monta o cabeçalho com as colunas dinâmicas do catálogo. */
function cabecalho(catalogo) {
  return [
    'Data',
    'Hora',
    'Placa',
    'KM',
    'Responsável',
    'Situação',
    'Decisão do responsável',
    ...catalogo.map((item) => item.nome),
    ...catalogo.map((item) => `Obs. ${item.nome}`),
    'Validade CRLV',
    'Validade Tacógrafo',
    'Possui lona',
    'Condição da lona',
    'Obs. lona',
    'Observações gerais',
    'Qtd. fotos'
  ]
}

function linhaDoChecklist(c, catalogo) {
  return [
    dataBr(c.data),
    c.hora ?? '',
    c.placa ?? '',
    c.km ?? '',
    c.responsavel ?? '',
    SITUACAO[c.status] ?? c.status ?? '',
    APROVACAO[c.aprovacao] ?? 'Não informado',
    ...catalogo.map((item) => STATUS_ITEM[c.itens[item.chave]?.status] ?? ''),
    ...catalogo.map((item) => c.itens[item.chave]?.observacao ?? ''),
    dataBr(c.crlv_validade),
    dataBr(c.tacografo_validade),
    c.lona_possui ? 'Sim' : 'Não',
    // Sem lona não há condição a informar.
    c.lona_possui ? (CONDICAO_LONA[c.lona_condicao] ?? '') : '',
    c.lona_obs ?? '',
    c.obs_geral ?? '',
    c.total_fotos ?? 0
  ]
}

// GET /api/exportar/csv?de=&ate=&placa=
router.get(
  '/csv',
  autenticar,
  assincrono((req, res) => {
    const { periodo, placa, catalogo, linhas } = relatorios.dadosParaCsv({
      de: req.query.de,
      ate: req.query.ate,
      placa: req.query.placa
    })

    const conteudo =
      BOM +
      [
        linhaCsv(cabecalho(catalogo)),
        ...linhas.map((c) => linhaCsv(linhaDoChecklist(c, catalogo)))
      ].join(QUEBRA) +
      QUEBRA

    // Exportar a base da frota é uma ação relevante — fica registrada.
    registrar(req, 'EXPORTAR', 'checklists', null, {
      de: periodo.de,
      ate: periodo.ate,
      placa,
      linhas: linhas.length
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="checklists.csv"')
    res.setHeader('Cache-Control', 'no-store')
    res.send(conteudo)
  })
)

export default router
