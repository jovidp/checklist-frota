// Regra de negócio do status do checklist — calculada SEMPRE no servidor.
//
// A palavra do responsável vale mais que o cálculo dos itens: quem olha o
// caminhão decide se ele roda. O cálculo não reprova quem foi aprovado — só
// registra, com "RESTRICAO", que a liberação saiu com pendência.
//
//   Aprovou      -> RESTRICAO se houver NC (crítico ou não) ou lona RUIM
//                   APROVADO  se estiver tudo limpo
//   Não aprovou  -> REPROVADO, sempre
//
// Sem decisão (registros anteriores à criação do campo `aprovacao`) vale a
// regra antiga, puramente automática:
//   REPROVADO  -> algum item crítico está NC
//   RESTRICAO  -> há NC não crítico, ou lona RUIM
//   APROVADO   -> nenhum NC e lona OK (ou sem lona)

const VALIDOS = new Set(['OK', 'NC', 'NA', 'PEND'])
const DECISOES = new Set(['APROVADO', 'REPROVADO'])

/**
 * @param itens     respostas do checklist: [{ chave, status }]
 * @param catalogo  itens ativos do catálogo: [{ chave, critico }]
 * @param lonaPossui / lonaCondicao  dados da lona
 * @param aprovacao decisão final do responsável: 'APROVADO' | 'REPROVADO' | null
 */
export function calcularStatus({
  itens = [],
  catalogo = [],
  lonaPossui = false,
  lonaCondicao = null,
  aprovacao = null
}) {
  const respostas = new Map()
  for (const item of itens) {
    if (!item?.chave) continue
    const s = String(item.status ?? '').toUpperCase()
    respostas.set(item.chave, VALIDOS.has(s) ? s : 'PEND')
  }

  const totais = { ok: 0, nc: 0, na: 0, pendente: 0 }
  let criticoReprovado = false

  // Percorre o catálogo, não o que o cliente enviou: item ausente é PEND.
  for (const doCatalogo of catalogo) {
    const status = respostas.get(doCatalogo.chave) ?? 'PEND'

    if (status === 'OK') totais.ok += 1
    else if (status === 'NA') totais.na += 1
    else if (status === 'PEND') totais.pendente += 1
    else {
      totais.nc += 1
      // critico chega como 0/1 do SQLite ou boolean já convertido.
      if (doCatalogo.critico === 1 || doCatalogo.critico === true) criticoReprovado = true
    }
  }

  const lonaRuim = Boolean(lonaPossui) && String(lonaCondicao ?? '').toUpperCase() === 'RUIM'
  const comPendencia = totais.nc > 0 || lonaRuim

  const decisao = String(aprovacao ?? '').trim().toUpperCase()

  let status
  if (decisao === 'REPROVADO') {
    status = 'REPROVADO'
  } else if (decisao === 'APROVADO') {
    // A decisão sobrepõe o cálculo: nem item crítico derruba a aprovação.
    status = comPendencia ? 'RESTRICAO' : 'APROVADO'
  } else {
    // Registro sem decisão gravada: regra automática de antes.
    if (criticoReprovado) status = 'REPROVADO'
    else if (comPendencia) status = 'RESTRICAO'
    else status = 'APROVADO'
  }

  return { status, totais }
}

/** Só para deixar explícito qual conjunto de decisões o cálculo reconhece. */
export function decisaoValida(valor) {
  return DECISOES.has(String(valor ?? '').trim().toUpperCase())
}
