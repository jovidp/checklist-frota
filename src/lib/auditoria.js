// Registro de auditoria. Nunca interrompe a operação principal:
// falhar ao gravar o log não pode derrubar uma requisição bem-sucedida.
import { executar } from '../db/index.js'

/** Extrai o IP do cliente considerando proxy reverso. */
function ipDaRequisicao(req) {
  const encaminhado = req?.headers?.['x-forwarded-for']
  if (typeof encaminhado === 'string' && encaminhado.trim() !== '') {
    return encaminhado.split(',')[0].trim().slice(0, 60)
  }
  return String(req?.ip ?? req?.socket?.remoteAddress ?? '').slice(0, 60) || null
}

export function registrar(req, acao, entidade, entidadeId = null, detalhe = null) {
  try {
    const texto =
      detalhe === null || detalhe === undefined
        ? null
        : typeof detalhe === 'string'
          ? detalhe
          : JSON.stringify(detalhe)

    executar(
      `INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, detalhe, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      req?.usuario?.id ?? null,
      String(acao),
      String(entidade),
      entidadeId === null || entidadeId === undefined ? null : Number(entidadeId),
      texto,
      ipDaRequisicao(req)
    )
  } catch (erro) {
    console.warn('[auditoria] não foi possível registrar:', erro.message)
  }
}
