// JWT HS256 implementado com node:crypto (sem bibliotecas externas).
import { createHmac, timingSafeEqual } from 'node:crypto'
import config from '../config.js'
import { ErroApi } from './respostas.js'

const CABECALHO = { alg: 'HS256', typ: 'JWT' }

function paraBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function deBase64Url(texto) {
  return Buffer.from(texto, 'base64url').toString('utf8')
}

function assinatura(conteudo) {
  return createHmac('sha256', config.JWT_SEGREDO).update(conteudo).digest('base64url')
}

/**
 * Gera o token. `horas` sobrescreve a validade padrão do .env.
 * A carga recebe iat/exp em segundos (padrão do JWT).
 */
export function assinar(carga, horas = config.JWT_EXPIRA_HORAS) {
  const agora = Math.floor(Date.now() / 1000)
  const corpo = { ...carga, iat: agora, exp: agora + Math.round(horas * 3600) }

  const cabecalho = paraBase64Url(JSON.stringify(CABECALHO))
  const dados = paraBase64Url(JSON.stringify(corpo))
  const conteudo = `${cabecalho}.${dados}`

  return `${conteudo}.${assinatura(conteudo)}`
}

/** Valida assinatura e expiração. Lança ErroApi 401 em qualquer falha. */
export function verificar(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new ErroApi('NAO_AUTENTICADO', 'Token não informado.', 401)
  }

  const partes = token.split('.')
  if (partes.length !== 3) {
    throw new ErroApi('NAO_AUTENTICADO', 'Token inválido.', 401)
  }

  const [cabecalho, dados, recebida] = partes
  const esperada = assinatura(`${cabecalho}.${dados}`)

  const a = Buffer.from(recebida)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ErroApi('NAO_AUTENTICADO', 'Token inválido.', 401)
  }

  let carga
  try {
    const alg = JSON.parse(deBase64Url(cabecalho))?.alg
    if (alg !== 'HS256') throw new Error('algoritmo não suportado')
    carga = JSON.parse(deBase64Url(dados))
  } catch {
    throw new ErroApi('NAO_AUTENTICADO', 'Token inválido.', 401)
  }

  const agora = Math.floor(Date.now() / 1000)
  if (typeof carga.exp !== 'number' || carga.exp <= agora) {
    throw new ErroApi('NAO_AUTENTICADO', 'Sessão expirada. Entre novamente.', 401)
  }

  return carga
}
