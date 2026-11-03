// Validações e normalizações de entrada. Nada vindo do cliente é confiável.
import { ErroApi } from './respostas.js'

const PLACA_ANTIGA = /^[A-Z]{3}\d{4}$/
const PLACA_MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
const HORA_24H = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Maiúsculas, sem hífen, espaços ou pontuação. */
export function normalizarPlaca(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function validarPlaca(valor) {
  const placa = normalizarPlaca(valor)
  return PLACA_ANTIGA.test(placa) || PLACA_MERCOSUL.test(placa)
}

/** Aceita apenas AAAA-MM-DD com data de calendário existente. */
export function validarData(valor) {
  if (typeof valor !== 'string' || !DATA_ISO.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  if (mes < 1 || mes > 12 || dia < 1) return false
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  )
}

export function validarHora(valor) {
  return typeof valor === 'string' && HORA_24H.test(valor)
}

export function validarEmail(valor) {
  return typeof valor === 'string' && valor.length <= 254 && EMAIL.test(valor.trim())
}

/** Converte query string em paginação segura (limite 1..100, padrão 20). */
export function paginacao(query = {}) {
  const pagina = Math.max(1, comoInteiro(query.pagina, 1) ?? 1)
  const bruto = comoInteiro(query.limite, 20) ?? 20
  const limite = Math.min(100, Math.max(1, bruto))
  return { pagina, limite, offset: (pagina - 1) * limite }
}

/** Aceita true/false, 1/0, "sim"/"nao", "true"/"false". */
export function comoBooleano(valor, padrao = false) {
  if (valor === null || valor === undefined || valor === '') return padrao
  if (typeof valor === 'boolean') return valor
  if (typeof valor === 'number') return valor !== 0
  const t = String(valor).trim().toLowerCase()
  if (['1', 'true', 'sim', 's', 'on'].includes(t)) return true
  if (['0', 'false', 'nao', 'não', 'n', 'off'].includes(t)) return false
  return padrao
}

export function comoInteiro(valor, padrao = null) {
  if (valor === null || valor === undefined || valor === '') return padrao
  const n = Number(valor)
  return Number.isFinite(n) ? Math.trunc(n) : padrao
}

/** Normaliza texto livre: apara espaços, corta no limite e devolve null se vazio. */
export function texto(valor, maximo = 500) {
  if (valor === null || valor === undefined) return null
  const t = String(valor).trim()
  if (t === '') return null
  return t.length > maximo ? t.slice(0, maximo) : t
}

/**
 * Confere campos obrigatórios de uma só vez.
 * exigir({ placa: '' }, ['placa']) -> lança VALIDACAO com { placa: 'obrigatório' }
 */
export function exigir(campos, obrigatorios) {
  const faltando = {}
  for (const nome of obrigatorios) {
    const v = campos?.[nome]
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      faltando[nome] = 'obrigatório'
    }
  }
  if (Object.keys(faltando).length > 0) {
    const lista = Object.keys(faltando).join(', ')
    throw new ErroApi(
      'VALIDACAO',
      `Preencha os campos obrigatórios: ${lista}.`,
      400,
      faltando
    )
  }
  return true
}
