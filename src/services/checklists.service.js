// Regras de dados dos checklists — o núcleo do sistema.
// Esta camada não conhece req/res: recebe valores já extraídos do corpo da
// requisição e devolve objetos prontos para virar JSON.
//
// Princípios inegociáveis aplicados aqui:
//   - status e contadores são SEMPRE calculados no servidor (lib/status.js);
//   - o catálogo manda: item ausente no envio é gravado como PEND;
//   - não existe "motorista" — o responsável é o usuário autenticado.
import config from '../config.js'
import { consultar, consultarUm, executar, transacao } from '../db/index.js'
import { ErroApi } from '../lib/respostas.js'
import { calcularStatus } from '../lib/status.js'
import { salvarFoto, removerArquivo, urlDaFoto } from '../lib/fotos.js'
import {
  comoBooleano,
  comoInteiro,
  exigir,
  normalizarPlaca,
  texto,
  validarData,
  validarHora
} from '../lib/validacao.js'

const STATUS_ITEM = new Set(['OK', 'NC', 'NA', 'PEND'])
const STATUS_CHECKLIST = new Set(['APROVADO', 'RESTRICAO', 'REPROVADO'])
// Decisão final do responsável — só aprova ou reprova, sem meio-termo.
const APROVACOES = new Set(['APROVADO', 'REPROVADO'])
const CONDICOES_LONA = new Set(['BOA', 'RUIM'])
const KM_MAXIMO = 9999999

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Itens ativos do catálogo, na ordem de exibição. */
function catalogoAtivo() {
  return consultar(
    `SELECT chave, nome, dica, categoria, critico, ordem
       FROM itens_catalogo
      WHERE ativo = 1
      ORDER BY ordem ASC, id ASC`
  )
}

/** Linha crua do checklist — usada nas conferências de existência e permissão. */
function linhaChecklist(id) {
  return consultarUm('SELECT * FROM checklists WHERE id = ?', id)
}

function exigirLinhaChecklist(id) {
  const linha = linhaChecklist(id)
  if (!linha) throw new ErroApi('NAO_ENCONTRADO', 'Checklist não encontrado.', 404)
  return linha
}

/**
 * Operador só mexe no que ele mesmo criou; admin mexe em tudo.
 * `donoId` é o usuario_id gravado no checklist.
 */
function garantirAcessoEdicao(donoId, usuario) {
  if (!usuario) {
    throw new ErroApi('NAO_AUTENTICADO', 'Faça login para continuar.', 401)
  }
  if (usuario.perfil === 'admin') return
  if (Number(donoId) !== Number(usuario.id)) {
    throw new ErroApi(
      'SEM_PERMISSAO',
      'Você só pode alterar checklists criados por você.',
      403
    )
  }
}

/** Data ISO opcional: string vazia vira null, formato errado vira 400. */
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

// ---------------------------------------------------------------------------
// Mapeadores (SQLite guarda 0/1; o JSON devolve booleanos)
// ---------------------------------------------------------------------------

/** Linha da view vw_checklists -> item da listagem resumida. */
function mapearResumo(linha) {
  if (!linha) return null
  return {
    id: linha.id,
    data: linha.data,
    hora: linha.hora,
    km: linha.km,
    status: linha.status,
    aprovacao: linha.aprovacao,
    veiculo: {
      id: linha.veiculo_id,
      placa: linha.placa,
      frota: linha.frota,
      modelo: linha.modelo
    },
    responsavel: { id: linha.usuario_id, nome: linha.responsavel },
    resumo: {
      ok: linha.total_ok,
      nc: linha.total_nc,
      na: linha.total_na,
      pendente: linha.total_pendente
    },
    total_fotos: linha.total_fotos,
    criado_em: linha.criado_em
  }
}

function mapearFoto(linha) {
  if (!linha) return null
  return {
    id: linha.id,
    checklist_id: linha.checklist_id,
    item_chave: linha.item_chave,
    url: urlDaFoto(linha.arquivo),
    legenda: linha.legenda,
    mime: linha.mime,
    tamanho: linha.tamanho,
    criado_em: linha.criado_em
  }
}

// ---------------------------------------------------------------------------
// Validação do payload
// ---------------------------------------------------------------------------

/** Valida a chave de item de uma foto: opcional, mas precisa existir. */
function chaveDeItemDaFoto(valor, catalogo) {
  const chave = texto(valor, 60)
  if (chave === null) return null
  if (!catalogo.some((item) => item.chave === chave)) {
    throw new ErroApi('VALIDACAO', `Item desconhecido na foto: "${chave}".`, 400, {
      item_chave: 'chave inexistente no catálogo'
    })
  }
  return chave
}

/**
 * Normaliza e valida o cabeçalho + os itens do checklist.
 * Devolve tudo pronto para gravar, com status e totais já calculados.
 */
function normalizarEntrada(corpo = {}, catalogo) {
  const veiculo_id = comoInteiro(corpo.veiculo_id)
  const data = texto(corpo.data, 10)
  exigir({ veiculo_id, data }, ['veiculo_id', 'data'])

  if (!validarData(data)) {
    throw new ErroApi('VALIDACAO', 'Data inválida. Use o formato AAAA-MM-DD.', 400, {
      data: 'data inválida'
    })
  }

  const veiculo = consultarUm('SELECT id, ativo FROM veiculos WHERE id = ?', veiculo_id)
  if (!veiculo) {
    throw new ErroApi('NAO_ENCONTRADO', 'Veículo não encontrado.', 404)
  }
  if (veiculo.ativo !== 1) {
    throw new ErroApi(
      'VALIDACAO',
      'Veículo inativo: reative o cadastro antes de lançar checklists.',
      400,
      { veiculo_id: 'veículo inativo' }
    )
  }

  const hora = texto(corpo.hora, 5)
  if (hora !== null && !validarHora(hora)) {
    throw new ErroApi('VALIDACAO', 'Hora inválida. Use o formato HH:MM.', 400, {
      hora: 'hora inválida'
    })
  }

  let km = null
  if (corpo.km !== undefined && corpo.km !== null && corpo.km !== '') {
    km = comoInteiro(corpo.km)
    if (km === null || km < 0 || km > KM_MAXIMO) {
      throw new ErroApi('VALIDACAO', 'Quilometragem inválida.', 400, {
        km: 'valor inválido'
      })
    }
  }

  // Decisão final é obrigatória: um checklist sem veredito não serve de nada
  // para liberar (ou barrar) o caminhão.
  const aprovacao = String(corpo.aprovacao ?? '').trim().toUpperCase()
  if (!APROVACOES.has(aprovacao)) {
    throw new ErroApi(
      'VALIDACAO',
      'Informe a decisão final: você aprova ou não o veículo?',
      400,
      { aprovacao: 'obrigatório' }
    )
  }

  const lona_possui = comoBooleano(corpo.lona_possui, false)
  let lona_condicao = null
  if (lona_possui) {
    const condicao = String(corpo.lona_condicao ?? '').trim().toUpperCase()
    if (condicao !== '') {
      if (!CONDICOES_LONA.has(condicao)) {
        throw new ErroApi('VALIDACAO', 'Condição da lona deve ser "BOA" ou "RUIM".', 400, {
          lona_condicao: 'valor inválido'
        })
      }
      lona_condicao = condicao
    }
  }
  // Sem lona não há condição a registrar.

  const permitidos = new Map(catalogo.map((item) => [item.chave, item]))
  const itens = []
  const informados = new Set()

  const enviados = corpo.itens
  if (enviados !== undefined && enviados !== null) {
    if (!Array.isArray(enviados)) {
      throw new ErroApi('VALIDACAO', 'O campo "itens" deve ser uma lista.', 400, {
        itens: 'formato inválido'
      })
    }
    for (const enviado of enviados) {
      const chave = texto(enviado?.chave, 60)
      if (chave === null) {
        throw new ErroApi('VALIDACAO', 'Há um item sem a chave informada.', 400, {
          itens: 'item sem chave'
        })
      }
      if (!permitidos.has(chave)) {
        throw new ErroApi('VALIDACAO', `Item desconhecido: "${chave}".`, 400, {
          [`itens.${chave}`]: 'chave inexistente no catálogo'
        })
      }
      if (informados.has(chave)) {
        throw new ErroApi('VALIDACAO', `Item repetido no envio: "${chave}".`, 400, {
          [`itens.${chave}`]: 'item duplicado'
        })
      }

      const status = String(enviado?.status ?? '').trim().toUpperCase() || 'PEND'
      if (!STATUS_ITEM.has(status)) {
        throw new ErroApi(
          'VALIDACAO',
          `Situação inválida no item "${chave}". Use OK, NC, NA ou PEND.`,
          400,
          { [`itens.${chave}`]: 'situação inválida' }
        )
      }

      informados.add(chave)
      itens.push({ chave, status, observacao: texto(enviado?.observacao, 500) })
    }
  }

  // Item não enviado é gravado como PEND: o checklist sempre reflete o catálogo.
  for (const doCatalogo of catalogo) {
    if (!informados.has(doCatalogo.chave)) {
      itens.push({ chave: doCatalogo.chave, status: 'PEND', observacao: null })
    }
  }

  // status/totais vindos do cliente são simplesmente ignorados.
  // A decisão entra no cálculo: ela manda mais que os itens.
  const { status, totais } = calcularStatus({
    itens,
    catalogo,
    lonaPossui: lona_possui,
    lonaCondicao: lona_condicao,
    aprovacao
  })

  return {
    veiculo_id,
    data,
    hora,
    km,
    crlv_validade: dataOpcional(corpo.crlv_validade, 'crlv_validade'),
    tacografo_validade: dataOpcional(corpo.tacografo_validade, 'tacografo_validade'),
    lona_possui,
    lona_condicao,
    lona_obs: texto(corpo.lona_obs, 500),
    obs_geral: texto(corpo.obs_geral, 2000),
    itens,
    aprovacao,
    status,
    totais
  }
}

/** Valida a lista de fotos do POST (o conteúdo só é gravado na transação). */
function normalizarFotos(corpo = {}, catalogo) {
  const enviadas = corpo.fotos
  if (enviadas === undefined || enviadas === null) return []

  if (!Array.isArray(enviadas)) {
    throw new ErroApi('VALIDACAO', 'O campo "fotos" deve ser uma lista.', 400, {
      fotos: 'formato inválido'
    })
  }
  if (enviadas.length > config.MAX_FOTOS_CHECKLIST) {
    throw new ErroApi(
      'VALIDACAO',
      `Limite de ${config.MAX_FOTOS_CHECKLIST} fotos por checklist excedido.`,
      400,
      { fotos: 'quantidade acima do limite' }
    )
  }

  return enviadas.map((foto) => ({
    item_chave: chaveDeItemDaFoto(foto?.item_chave, catalogo),
    legenda: texto(foto?.legenda, 200),
    dados: foto?.dados
  }))
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

/** Regrava todos os itens do checklist (uma linha por item do catálogo). */
function gravarItens(checklistId, itens) {
  for (const item of itens) {
    executar(
      `INSERT INTO checklist_itens (checklist_id, item_chave, status, observacao)
       VALUES (?, ?, ?, ?)`,
      checklistId,
      item.chave,
      item.status,
      item.observacao
    )
  }
}

function inserirFoto(checklistId, foto, salva) {
  return executar(
    `INSERT INTO fotos (checklist_id, item_chave, arquivo, mime, tamanho, legenda)
     VALUES (?, ?, ?, ?, ?, ?)`,
    checklistId,
    foto.item_chave,
    salva.arquivo,
    salva.mime,
    salva.tamanho,
    foto.legenda
  ).id
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/**
 * Listagem resumida com filtros e paginação, mais recentes primeiro.
 * `limite`/`offset` já chegam validados pela rota.
 */
export function listar(filtros = {}) {
  const {
    placa = null,
    veiculo_id = null,
    de = null,
    ate = null,
    status = null,
    busca = null,
    limite = 20,
    offset = 0
  } = filtros

  const condicoes = []
  const params = []

  if (placa) {
    condicoes.push('placa = ?')
    params.push(normalizarPlaca(placa))
  }

  if (veiculo_id !== null && veiculo_id !== undefined && veiculo_id !== '') {
    const id = comoInteiro(veiculo_id)
    if (id === null) {
      throw new ErroApi('VALIDACAO', 'Filtro de veículo inválido.', 400, {
        veiculo_id: 'valor inválido'
      })
    }
    condicoes.push('veiculo_id = ?')
    params.push(id)
  }

  const dataDe = dataOpcional(de, 'de')
  if (dataDe) {
    condicoes.push('data >= ?')
    params.push(dataDe)
  }

  const dataAte = dataOpcional(ate, 'ate')
  if (dataAte) {
    condicoes.push('data <= ?')
    params.push(dataAte)
  }

  if (status) {
    const alvo = String(status).trim().toUpperCase()
    if (!STATUS_CHECKLIST.has(alvo)) {
      throw new ErroApi(
        'VALIDACAO',
        'Situação inválida. Use APROVADO, RESTRICAO ou REPROVADO.',
        400,
        { status: 'valor inválido' }
      )
    }
    condicoes.push('status = ?')
    params.push(alvo)
  }

  if (busca) {
    // LIKE do SQLite já é insensível a maiúsculas para ASCII.
    condicoes.push('(placa LIKE ? OR frota LIKE ? OR modelo LIKE ? OR responsavel LIKE ?)')
    const alvo = `%${String(busca).trim()}%`
    params.push(alvo, alvo, alvo, alvo)
  }

  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : ''

  const linhas = consultar(
    `SELECT * FROM vw_checklists ${onde}
      ORDER BY data DESC, hora DESC, id DESC
      LIMIT ? OFFSET ?`,
    ...params,
    limite,
    offset
  )

  const total = Number(
    consultarUm(`SELECT COUNT(*) AS total FROM vw_checklists ${onde}`, ...params)?.total ?? 0
  )

  return { itens: linhas.map(mapearResumo), total }
}

/**
 * Objeto completo do checklist: cabeçalho, veículo, responsável, TODOS os
 * itens ativos do catálogo (mesmo sem resposta) e as fotos.
 */
export function buscarCompleto(id) {
  const linha = consultarUm(
    `SELECT c.*,
            v.placa, v.frota, v.modelo, v.marca, v.tipo_carroceria,
            u.nome AS responsavel_nome, u.email AS responsavel_email
       FROM checklists c
       JOIN veiculos v ON v.id = c.veiculo_id
       JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = ?`,
    id
  )
  if (!linha) return null

  // LEFT JOIN pelo catálogo: item sem resposta aparece como PEND, na ordem certa.
  const itens = consultar(
    `SELECT ic.chave, ic.nome, ic.dica, ic.categoria, ic.critico, ic.ordem,
            COALESCE(ci.status, 'PEND') AS status, ci.observacao
       FROM itens_catalogo ic
       LEFT JOIN checklist_itens ci
              ON ci.item_chave = ic.chave AND ci.checklist_id = ?
      WHERE ic.ativo = 1
      ORDER BY ic.ordem ASC, ic.id ASC`,
    linha.id
  )

  const fotos = consultar(
    `SELECT id, checklist_id, item_chave, arquivo, mime, tamanho, legenda, criado_em
       FROM fotos WHERE checklist_id = ? ORDER BY id ASC`,
    linha.id
  ).map(mapearFoto)

  // Índice das fotos por item para anexá-las ao item correspondente.
  const fotosPorItem = new Map()
  for (const foto of fotos) {
    if (!foto.item_chave) continue
    if (!fotosPorItem.has(foto.item_chave)) fotosPorItem.set(foto.item_chave, [])
    fotosPorItem.get(foto.item_chave).push({
      id: foto.id,
      url: foto.url,
      legenda: foto.legenda
    })
  }

  return {
    id: linha.id,
    data: linha.data,
    hora: linha.hora,
    km: linha.km,
    status: linha.status,
    aprovacao: linha.aprovacao,
    crlv_validade: linha.crlv_validade,
    tacografo_validade: linha.tacografo_validade,
    lona_possui: linha.lona_possui === 1,
    lona_condicao: linha.lona_condicao,
    lona_obs: linha.lona_obs,
    obs_geral: linha.obs_geral,
    veiculo: {
      id: linha.veiculo_id,
      placa: linha.placa,
      frota: linha.frota,
      modelo: linha.modelo,
      marca: linha.marca,
      tipo_carroceria: linha.tipo_carroceria
    },
    responsavel: {
      id: linha.usuario_id,
      nome: linha.responsavel_nome,
      email: linha.responsavel_email
    },
    resumo: {
      ok: linha.total_ok,
      nc: linha.total_nc,
      na: linha.total_na,
      pendente: linha.total_pendente
    },
    itens: itens.map((item) => ({
      chave: item.chave,
      nome: item.nome,
      dica: item.dica,
      categoria: item.categoria,
      critico: item.critico === 1,
      ordem: item.ordem,
      status: item.status,
      observacao: item.observacao ?? '',
      fotos: fotosPorItem.get(item.chave) ?? []
    })),
    fotos,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em
  }
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Cria o checklist inteiro — cabeçalho, itens e fotos — em UMA transação.
 * Se qualquer foto falhar, o banco sofre ROLLBACK e os arquivos já escritos
 * em disco são apagados: nada de arquivos órfãos em data/uploads.
 */
export function criar(corpo = {}, usuario) {
  if (!usuario?.id) {
    throw new ErroApi('NAO_AUTENTICADO', 'Faça login para continuar.', 401)
  }

  const catalogo = catalogoAtivo()
  const dados = normalizarEntrada(corpo, catalogo)
  const fotos = normalizarFotos(corpo, catalogo)

  const gravados = [] // arquivos escritos em disco durante a transação

  try {
    const id = transacao(() => {
      const inserido = executar(
        `INSERT INTO checklists
           (veiculo_id, usuario_id, data, hora, km, status, aprovacao,
            crlv_validade, tacografo_validade,
            lona_possui, lona_condicao, lona_obs, obs_geral,
            total_ok, total_nc, total_na, total_pendente)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        dados.veiculo_id,
        usuario.id,
        dados.data,
        dados.hora,
        dados.km,
        dados.status,
        dados.aprovacao,
        dados.crlv_validade,
        dados.tacografo_validade,
        dados.lona_possui ? 1 : 0,
        dados.lona_condicao,
        dados.lona_obs,
        dados.obs_geral,
        dados.totais.ok,
        dados.totais.nc,
        dados.totais.na,
        dados.totais.pendente
      )

      gravarItens(inserido.id, dados.itens)

      for (const foto of fotos) {
        const salva = salvarFoto({ dados: foto.dados, itemChave: foto.item_chave })
        gravados.push(salva.arquivo)
        inserirFoto(inserido.id, foto, salva)
      }

      return inserido.id
    })

    return buscarCompleto(id)
  } catch (erro) {
    // O ROLLBACK desfez o banco; o disco precisa de limpeza compensatória.
    for (const arquivo of gravados) removerArquivo(arquivo)
    throw erro
  }
}

/**
 * Atualiza o cabeçalho e regrava os itens. As fotos têm rotas próprias e não
 * são tocadas aqui. Status e contadores são recalculados.
 */
export function atualizar(id, corpo = {}, usuario) {
  const atual = exigirLinhaChecklist(id)
  garantirAcessoEdicao(atual.usuario_id, usuario)

  const catalogo = catalogoAtivo()
  const dados = normalizarEntrada(corpo, catalogo)

  transacao(() => {
    executar(
      `UPDATE checklists
          SET veiculo_id = ?, data = ?, hora = ?, km = ?, status = ?, aprovacao = ?,
              crlv_validade = ?, tacografo_validade = ?,
              lona_possui = ?, lona_condicao = ?, lona_obs = ?, obs_geral = ?,
              total_ok = ?, total_nc = ?, total_na = ?, total_pendente = ?,
              atualizado_em = datetime('now','localtime')
        WHERE id = ?`,
      dados.veiculo_id,
      dados.data,
      dados.hora,
      dados.km,
      dados.status,
      dados.aprovacao,
      dados.crlv_validade,
      dados.tacografo_validade,
      dados.lona_possui ? 1 : 0,
      dados.lona_condicao,
      dados.lona_obs,
      dados.obs_geral,
      dados.totais.ok,
      dados.totais.nc,
      dados.totais.na,
      dados.totais.pendente,
      atual.id
    )

    // Regravar é mais simples e seguro que casar item a item.
    executar('DELETE FROM checklist_itens WHERE checklist_id = ?', atual.id)
    gravarItens(atual.id, dados.itens)
  })

  return buscarCompleto(atual.id)
}

/** Remove o checklist, seus itens, suas fotos (registros e arquivos). */
export function remover(id, usuario) {
  const atual = exigirLinhaChecklist(id)
  garantirAcessoEdicao(atual.usuario_id, usuario)

  const arquivos = consultar(
    'SELECT arquivo FROM fotos WHERE checklist_id = ?',
    atual.id
  ).map((linha) => linha.arquivo)

  transacao(() => {
    executar('DELETE FROM fotos WHERE checklist_id = ?', atual.id)
    executar('DELETE FROM checklist_itens WHERE checklist_id = ?', atual.id)
    executar('DELETE FROM checklists WHERE id = ?', atual.id)
  })

  // Só apaga do disco depois do COMMIT: se a transação falhasse, os arquivos
  // ainda seriam necessários.
  for (const arquivo of arquivos) removerArquivo(arquivo)

  return { removido: true, id: atual.id, total_fotos: arquivos.length }
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

/** Linha crua da foto com o dono do checklist — base das conferências. */
function linhaFoto(id) {
  return consultarUm(
    `SELECT f.*, c.usuario_id
       FROM fotos f
       JOIN checklists c ON c.id = f.checklist_id
      WHERE f.id = ?`,
    id
  )
}

export function buscarFoto(id) {
  return mapearFoto(linhaFoto(id))
}

/** Leitura é liberada a qualquer usuário autenticado. */
export function listarFotos(checklistId) {
  const atual = exigirLinhaChecklist(checklistId)

  return consultar(
    `SELECT id, checklist_id, item_chave, arquivo, mime, tamanho, legenda, criado_em
       FROM fotos WHERE checklist_id = ? ORDER BY id ASC`,
    atual.id
  ).map(mapearFoto)
}

/** Anexa uma foto ao checklist, respeitando o limite por checklist. */
export function adicionarFoto(checklistId, corpo = {}, usuario) {
  const atual = exigirLinhaChecklist(checklistId)
  garantirAcessoEdicao(atual.usuario_id, usuario)

  const existentes = Number(
    consultarUm('SELECT COUNT(*) AS total FROM fotos WHERE checklist_id = ?', atual.id)
      ?.total ?? 0
  )
  if (existentes >= config.MAX_FOTOS_CHECKLIST) {
    throw new ErroApi(
      'VALIDACAO',
      `Este checklist já atingiu o limite de ${config.MAX_FOTOS_CHECKLIST} fotos.`,
      400,
      { fotos: 'quantidade acima do limite' }
    )
  }

  const catalogo = catalogoAtivo()
  const foto = {
    item_chave: chaveDeItemDaFoto(corpo.item_chave, catalogo),
    legenda: texto(corpo.legenda, 200),
    dados: corpo.dados
  }

  const salva = salvarFoto({ dados: foto.dados, itemChave: foto.item_chave })
  try {
    const id = inserirFoto(atual.id, foto, salva)
    return buscarFoto(id)
  } catch (erro) {
    // O arquivo já está no disco: sem registro no banco, ele seria órfão.
    removerArquivo(salva.arquivo)
    throw erro
  }
}

/** Remove o registro da foto e o arquivo correspondente do disco. */
export function removerFoto(id, usuario) {
  const linha = linhaFoto(id)
  if (!linha) throw new ErroApi('NAO_ENCONTRADO', 'Foto não encontrada.', 404)
  garantirAcessoEdicao(linha.usuario_id, usuario)

  executar('DELETE FROM fotos WHERE id = ?', linha.id)
  removerArquivo(linha.arquivo)

  return { removida: true, id: linha.id, checklist_id: linha.checklist_id }
}
