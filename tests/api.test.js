// Testes de integração da API — node:test, sem dependências externas.
//
// O ambiente é isolado: DB_ARQUIVO e UPLOAD_DIR apontam para uma pasta
// temporária definida ANTES de qualquer import da aplicação, porque
// src/config.js resolve esses caminhos no momento em que é carregado.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// --------------------------------------------------------------------------
// Ambiente temporário
// --------------------------------------------------------------------------
const PASTA_TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'checklist-teste-'))
const PASTA_UPLOADS = path.join(PASTA_TEMP, 'uploads')

process.env.DB_ARQUIVO = path.join(PASTA_TEMP, 'teste.db')
process.env.UPLOAD_DIR = PASTA_UPLOADS
// Segredo fixo evita que o config grave data/.segredo no projeto real.
process.env.JWT_SEGREDO = 'segredo-exclusivo-dos-testes-automatizados-1234567890'
process.env.ADMIN_EMAIL = 'admin@transporte.com'
process.env.ADMIN_SENHA = 'admin123'
process.env.NODE_ENV = 'teste'

// JPEG 1x1 pixel válido: o servidor confere a assinatura binária (FF D8 FF),
// então um arquivo qualquer não serve.
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
  'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK' +
  'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG' +
  'h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl' +
  '5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA' +
  'AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYk' +
  'NOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE' +
  'hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk' +
  '5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=='

const FOTO_DATA_URL = `data:image/jpeg;base64,${JPEG_BASE64}`

// Chaves do catálogo padrão (src/db/schema.sql).
const ITENS_CRITICOS = ['pneus', 'luz_freio', 'vazamentos', 'freio', 'crlv', 'tacografo']
const ITENS_CATALOGO = [
  'pneus', 'lanternas', 'setas', 'luz_freio', 'retrovisores', 'limpadores',
  'oleo_motor', 'arrefecimento', 'vazamentos', 'freio', 'buzina', 'carroceria',
  'crlv', 'tacografo'
]

// --------------------------------------------------------------------------
// Estado compartilhado entre os testes
// --------------------------------------------------------------------------
let servidor
let base
let bd
let tokenAdmin
let tokenOperador
let veiculoId

/** Requisição à API já com JSON, token e resposta desserializada. */
async function api(metodo, rota, { token, corpo, cru = false } = {}) {
  const cabecalhos = {}
  if (token) cabecalhos.Authorization = `Bearer ${token}`
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json'

  const resposta = await fetch(base + rota, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  })

  if (cru) return { status: resposta.status, resposta, texto: await resposta.text() }

  const texto = await resposta.text()
  let json = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    json = null
  }
  return { status: resposta.status, corpo: json, resposta }
}

/** Monta a lista de itens com todos em OK, exceto as exceções informadas. */
function todosOk(excecoes = {}) {
  return ITENS_CATALOGO.map((chave) => ({
    chave,
    status: excecoes[chave] ?? 'OK',
    observacao: ''
  }))
}

/** Cria um checklist e devolve o corpo da resposta. */
async function criarChecklist(dados = {}, token = tokenAdmin) {
  return api('POST', '/api/checklists', {
    token,
    corpo: {
      veiculo_id: veiculoId,
      data: '2026-07-20',
      hora: '07:30',
      km: 100000,
      lona_possui: false,
      // Decisão final é obrigatória; os testes que a exercitam sobrescrevem.
      aprovacao: 'APROVADO',
      itens: todosOk(),
      ...dados
    }
  })
}

// --------------------------------------------------------------------------
// Preparação e limpeza
// --------------------------------------------------------------------------
before(async () => {
  const { default: app } = await import('../src/app.js')
  bd = await import('../src/db/index.js')
  const { gerarHash } = await import('../src/lib/senha.js')

  bd.garantirBanco()

  // Admin criado direto no banco: o seed.js é um script de linha de comando.
  bd.executar(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
     VALUES (?, ?, ?, 'admin', 1)`,
    'Administração do Transporte',
    'admin@transporte.com',
    gerarHash('admin123')
  )
  bd.executar(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
     VALUES (?, ?, ?, 'operador', 1)`,
    'Operador de Pátio',
    'operador@transporte.com',
    gerarHash('operador123')
  )

  // Porta 0 = o sistema operacional escolhe uma porta livre.
  await new Promise((resolve) => {
    servidor = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${servidor.address().port}`

  const login = await api('POST', '/api/auth/login', {
    corpo: { email: 'admin@transporte.com', senha: 'admin123' }
  })
  tokenAdmin = login.corpo.dados.token

  const loginOperador = await api('POST', '/api/auth/login', {
    corpo: { email: 'operador@transporte.com', senha: 'operador123' }
  })
  tokenOperador = loginOperador.corpo.dados.token

  const veiculo = await api('POST', '/api/veiculos', {
    token: tokenAdmin,
    corpo: {
      placa: 'BAS1A01',
      frota: '01',
      modelo: 'Constellation 24.280',
      marca: 'Volkswagen',
      ano: 2019,
      tipo_carroceria: 'Baú',
      possui_lona: true
    }
  })
  veiculoId = veiculo.corpo.dados.id
})

after(async () => {
  if (servidor) await new Promise((resolve) => servidor.close(resolve))
  bd?.fechar()
  // maxRetries: no Windows o arquivo do SQLite pode demorar a ser liberado.
  fs.rmSync(PASTA_TEMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

// --------------------------------------------------------------------------
// 1. Saúde
// --------------------------------------------------------------------------
describe('Saúde', () => {
  it('responde sem autenticação', async () => {
    const { status, corpo } = await api('GET', '/api/saude')
    assert.equal(status, 200)
    assert.equal(corpo.ok, true)
    assert.equal(corpo.dados.status, 'online')
    assert.equal(corpo.dados.banco, 'conectado')
  })
})

// --------------------------------------------------------------------------
// 2. Autenticação
// --------------------------------------------------------------------------
describe('Autenticação', () => {
  it('recusa senha errada com 401', async () => {
    const { status, corpo } = await api('POST', '/api/auth/login', {
      corpo: { email: 'admin@transporte.com', senha: 'senha-errada' }
    })
    assert.equal(status, 401)
    assert.equal(corpo.ok, false)
    assert.equal(corpo.erro.codigo, 'NAO_AUTENTICADO')
  })

  it('aceita credenciais corretas e devolve token', async () => {
    const { status, corpo } = await api('POST', '/api/auth/login', {
      corpo: { email: 'admin@transporte.com', senha: 'admin123' }
    })
    assert.equal(status, 200)
    assert.equal(corpo.ok, true)
    assert.ok(corpo.dados.token.length > 20)
    assert.equal(corpo.dados.usuario.perfil, 'admin')
    // A senha nunca pode vazar na resposta.
    assert.equal(corpo.dados.usuario.senha_hash, undefined)
  })

  it('bloqueia rota protegida sem token', async () => {
    const { status, corpo } = await api('GET', '/api/veiculos')
    assert.equal(status, 401)
    assert.equal(corpo.erro.codigo, 'NAO_AUTENTICADO')
  })

  it('bloqueia token inválido', async () => {
    const { status } = await api('GET', '/api/veiculos', { token: 'token.falso.aqui' })
    assert.equal(status, 401)
  })

  it('devolve o usuário do token em /api/auth/eu', async () => {
    const { status, corpo } = await api('GET', '/api/auth/eu', { token: tokenAdmin })
    assert.equal(status, 200)
    assert.equal(corpo.dados.email, 'admin@transporte.com')
  })
})

// --------------------------------------------------------------------------
// 3. Veículos
// --------------------------------------------------------------------------
describe('Veículos', () => {
  it('cria veículo normalizando a placa', async () => {
    const { status, corpo } = await api('POST', '/api/veiculos', {
      token: tokenAdmin,
      corpo: { placa: 'xyz-1a23', frota: '99', modelo: 'Atego 2426', possui_lona: false }
    })
    assert.equal(status, 201)
    assert.equal(corpo.dados.placa, 'XYZ1A23')
    assert.equal(corpo.dados.possui_lona, false)
    assert.equal(corpo.dados.ativo, true)
  })

  it('recusa placa duplicada com 409', async () => {
    const { status, corpo } = await api('POST', '/api/veiculos', {
      token: tokenAdmin,
      corpo: { placa: 'XYZ1A23', modelo: 'Duplicado' }
    })
    assert.equal(status, 409)
    assert.equal(corpo.erro.codigo, 'CONFLITO')
  })

  it('recusa placa em formato inválido com 400', async () => {
    const { status, corpo } = await api('POST', '/api/veiculos', {
      token: tokenAdmin,
      corpo: { placa: '123', modelo: 'Inválido' }
    })
    assert.equal(status, 400)
    assert.equal(corpo.erro.codigo, 'VALIDACAO')
  })

  it('lista veículos com booleanos convertidos', async () => {
    const { status, corpo } = await api('GET', '/api/veiculos', { token: tokenAdmin })
    assert.equal(status, 200)
    assert.ok(Array.isArray(corpo.dados))
    assert.ok(corpo.dados.length >= 2)
    for (const v of corpo.dados) {
      assert.equal(typeof v.ativo, 'boolean')
      assert.equal(typeof v.possui_lona, 'boolean')
    }
  })
})

// --------------------------------------------------------------------------
// 4. Catálogo de itens
// --------------------------------------------------------------------------
describe('Catálogo de itens', () => {
  it('lista os itens ativos em ordem, com critico booleano', async () => {
    const { status, corpo } = await api('GET', '/api/itens', { token: tokenAdmin })
    assert.equal(status, 200)
    assert.equal(corpo.dados.length, ITENS_CATALOGO.length)

    const chaves = corpo.dados.map((i) => i.chave)
    assert.deepEqual(chaves, ITENS_CATALOGO)

    for (const item of corpo.dados) {
      assert.equal(typeof item.critico, 'boolean')
      assert.ok(['inspecao', 'documentacao'].includes(item.categoria))
    }

    const criticos = corpo.dados.filter((i) => i.critico).map((i) => i.chave)
    assert.deepEqual(criticos.sort(), [...ITENS_CRITICOS].sort())
  })
})

// --------------------------------------------------------------------------
// 5. Cálculo da situação do checklist
// --------------------------------------------------------------------------
// Os testes deste bloco criam checklists com aprovacao: 'APROVADO' (padrão do
// helper): eles cobrem o que as NÃO CONFORMIDADES fazem por cima de uma
// aprovação. Reprovação é assunto do bloco 5.1.
describe('Situação calculada no servidor', () => {
  it('item crítico em NC vira restrição, não reprovação, se o responsável aprovou', async () => {
    const { status, corpo } = await criarChecklist({
      itens: todosOk({ freio: 'NC' })
    })
    assert.equal(status, 201)
    assert.equal(corpo.dados.status, 'RESTRICAO')
    assert.equal(corpo.dados.resumo.nc, 1)
  })

  it('tudo OK resulta em APROVADO', async () => {
    const { status, corpo } = await criarChecklist()
    assert.equal(status, 201)
    assert.equal(corpo.dados.status, 'APROVADO')
    assert.equal(corpo.dados.resumo.ok, ITENS_CATALOGO.length)
    assert.equal(corpo.dados.resumo.nc, 0)
    assert.equal(corpo.dados.resumo.pendente, 0)
  })

  it('NC em item não crítico resulta em RESTRICAO', async () => {
    const { corpo } = await criarChecklist({ itens: todosOk({ buzina: 'NC' }) })
    assert.equal(corpo.dados.status, 'RESTRICAO')
  })

  it('vários NC, críticos ou não, continuam sendo uma só restrição', async () => {
    const { corpo } = await criarChecklist({
      itens: todosOk({ buzina: 'NC', pneus: 'NC' })
    })
    assert.equal(corpo.dados.status, 'RESTRICAO')
    assert.equal(corpo.dados.resumo.nc, 2)
  })

  it('lona em condição RUIM resulta em RESTRICAO mesmo com tudo OK', async () => {
    const { corpo } = await criarChecklist({
      lona_possui: true,
      lona_condicao: 'RUIM',
      lona_obs: 'Rasgada na lateral direita'
    })
    assert.equal(corpo.dados.status, 'RESTRICAO')
    assert.equal(corpo.dados.lona_condicao, 'RUIM')
  })

  it('lona BOA não altera o APROVADO', async () => {
    const { corpo } = await criarChecklist({ lona_possui: true, lona_condicao: 'BOA' })
    assert.equal(corpo.dados.status, 'APROVADO')
  })

  it('ignora lona_condicao quando o veículo não possui lona', async () => {
    const { corpo } = await criarChecklist({ lona_possui: false, lona_condicao: 'RUIM' })
    assert.equal(corpo.dados.lona_condicao, null)
    assert.equal(corpo.dados.status, 'APROVADO')
  })

  it('itens NA não reprovam nem restringem', async () => {
    const { corpo } = await criarChecklist({ itens: todosOk({ tacografo: 'NA' }) })
    assert.equal(corpo.dados.status, 'APROVADO')
    assert.equal(corpo.dados.resumo.na, 1)
  })

  it('itens omitidos são gravados como PEND', async () => {
    const { status, corpo } = await criarChecklist({
      itens: [{ chave: 'pneus', status: 'OK', observacao: '' }]
    })
    assert.equal(status, 201)
    assert.equal(corpo.dados.resumo.ok, 1)
    assert.equal(corpo.dados.resumo.pendente, ITENS_CATALOGO.length - 1)

    const pendentes = corpo.dados.itens.filter((i) => i.status === 'PEND')
    assert.equal(pendentes.length, ITENS_CATALOGO.length - 1)
    // Pendência não é não conformidade: sem NC, o veículo é aprovado.
    assert.equal(corpo.dados.status, 'APROVADO')
  })

  it('ignora status e totais enviados pelo cliente', async () => {
    const { corpo } = await criarChecklist({
      status: 'APROVADO',
      total_nc: 99,
      itens: todosOk({ pneus: 'NC' })
    })
    assert.equal(corpo.dados.status, 'RESTRICAO')
    assert.equal(corpo.dados.resumo.nc, 1)
  })

  it('recusa chave de item desconhecida com 400', async () => {
    const { status, corpo } = await criarChecklist({
      itens: [{ chave: 'item_que_nao_existe', status: 'OK' }]
    })
    assert.equal(status, 400)
    assert.equal(corpo.erro.codigo, 'VALIDACAO')
  })

  it('recusa status de item desconhecido com 400', async () => {
    const { status, corpo } = await criarChecklist({
      itens: [{ chave: 'pneus', status: 'TALVEZ' }]
    })
    assert.equal(status, 400)
    assert.equal(corpo.erro.codigo, 'VALIDACAO')
  })

  it('recusa veículo inexistente', async () => {
    const { status } = await criarChecklist({ veiculo_id: 999999 })
    assert.ok(status === 404 || status === 400)
  })
})

// --------------------------------------------------------------------------
// 5.1 Decisão final do responsável
// --------------------------------------------------------------------------
describe('Decisão final (aprova ou não o veículo)', () => {
  it('grava a aprovação informada pelo responsável', async () => {
    const { status, corpo } = await criarChecklist({ aprovacao: 'APROVADO' })
    assert.equal(status, 201)
    assert.equal(corpo.dados.aprovacao, 'APROVADO')
  })

  it('grava a reprovação informada pelo responsável', async () => {
    const { corpo } = await criarChecklist({ aprovacao: 'REPROVADO' })
    assert.equal(corpo.dados.aprovacao, 'REPROVADO')
  })

  it('recusa checklist sem decisão com 400', async () => {
    const { status, corpo } = await criarChecklist({ aprovacao: undefined })
    assert.equal(status, 400)
    assert.equal(corpo.erro.codigo, 'VALIDACAO')
    assert.ok(corpo.erro.campos.aprovacao)
  })

  it('recusa decisão fora das opções válidas', async () => {
    const { status, corpo } = await criarChecklist({ aprovacao: 'TALVEZ' })
    assert.equal(status, 400)
    assert.equal(corpo.erro.codigo, 'VALIDACAO')
  })

  // A decisão é humana e vale mais que o cálculo: ela manda nos dois sentidos.
  it('aprovar com item crítico não conforme não deixa o checklist reprovado', async () => {
    const { corpo } = await criarChecklist({
      aprovacao: 'APROVADO',
      itens: todosOk({ freio: 'NC' }),
      obs_geral: 'Freio ajustado na hora pelo mecânico.'
    })
    assert.equal(corpo.dados.status, 'RESTRICAO')
    assert.equal(corpo.dados.aprovacao, 'APROVADO')
  })

  it('reprovar derruba o checklist mesmo com todos os itens conformes', async () => {
    const { corpo } = await criarChecklist({ aprovacao: 'REPROVADO' })
    assert.equal(corpo.dados.status, 'REPROVADO')
    assert.equal(corpo.dados.aprovacao, 'REPROVADO')
  })

  it('aprovar sem nenhuma não conformidade resulta em APROVADO limpo', async () => {
    const { corpo } = await criarChecklist({ aprovacao: 'APROVADO' })
    assert.equal(corpo.dados.status, 'APROVADO')
    assert.equal(corpo.dados.resumo.nc, 0)
  })

  it('reprovar com não conformidades continua REPROVADO, sem virar restrição', async () => {
    const { corpo } = await criarChecklist({
      aprovacao: 'REPROVADO',
      itens: todosOk({ buzina: 'NC' })
    })
    assert.equal(corpo.dados.status, 'REPROVADO')
    assert.equal(corpo.dados.resumo.nc, 1)
  })

  it('mudar a decisão na edição recalcula o status', async () => {
    const criado = await criarChecklist({
      aprovacao: 'REPROVADO',
      itens: todosOk({ buzina: 'NC' })
    })
    assert.equal(criado.corpo.dados.status, 'REPROVADO')

    const { status, corpo } = await api('PUT', `/api/checklists/${criado.corpo.dados.id}`, {
      token: tokenAdmin,
      corpo: {
        veiculo_id: veiculoId,
        data: '2026-07-20',
        aprovacao: 'APROVADO',
        itens: todosOk({ buzina: 'NC' })
      }
    })
    assert.equal(status, 200)
    assert.equal(corpo.dados.status, 'RESTRICAO')
    assert.equal(corpo.dados.aprovacao, 'APROVADO')
  })

  it('a decisão aparece na listagem do histórico', async () => {
    const criado = await criarChecklist({ aprovacao: 'REPROVADO' })
    const { corpo } = await api('GET', '/api/checklists?limite=100', { token: tokenAdmin })
    const naLista = corpo.dados.find((c) => c.id === criado.corpo.dados.id)
    assert.equal(naLista.aprovacao, 'REPROVADO')
  })
})

// --------------------------------------------------------------------------
// 6. Consulta do checklist completo
// --------------------------------------------------------------------------
describe('Consulta de checklist', () => {
  it('traz todos os itens do catálogo, na ordem, com o responsável', async () => {
    const criado = await criarChecklist({
      obs_geral: 'Veículo liberado.',
      itens: todosOk({ buzina: 'NC' })
    })
    const { status, corpo } = await api('GET', `/api/checklists/${criado.corpo.dados.id}`, {
      token: tokenAdmin
    })

    assert.equal(status, 200)
    assert.deepEqual(corpo.dados.itens.map((i) => i.chave), ITENS_CATALOGO)
    assert.equal(corpo.dados.obs_geral, 'Veículo liberado.')
    assert.equal(corpo.dados.veiculo.id, veiculoId)
    // O responsável é o usuário do token — não existe campo "motorista".
    assert.equal(corpo.dados.responsavel.email, 'admin@transporte.com')
    assert.equal(corpo.dados.motorista, undefined)

    const buzina = corpo.dados.itens.find((i) => i.chave === 'buzina')
    assert.equal(buzina.status, 'NC')
    assert.equal(typeof buzina.critico, 'boolean')
    assert.ok(Array.isArray(buzina.fotos))
  })

  it('lista o histórico com paginação', async () => {
    const { status, corpo } = await api('GET', '/api/checklists?pagina=1&limite=5', {
      token: tokenAdmin
    })
    assert.equal(status, 200)
    assert.ok(corpo.dados.length <= 5)
    assert.equal(corpo.paginacao.pagina, 1)
    assert.equal(corpo.paginacao.limite, 5)
    assert.ok(corpo.paginacao.total >= corpo.dados.length)
  })

  it('devolve 404 para checklist inexistente', async () => {
    const { status, corpo } = await api('GET', '/api/checklists/999999', { token: tokenAdmin })
    assert.equal(status, 404)
    assert.equal(corpo.erro.codigo, 'NAO_ENCONTRADO')
  })
})

// --------------------------------------------------------------------------
// 7. Fotos
// --------------------------------------------------------------------------
describe('Fotos', () => {
  it('envia foto base64, grava o arquivo em disco e serve a URL', async () => {
    const criado = await criarChecklist()
    const checklistId = criado.corpo.dados.id

    const envio = await api('POST', `/api/checklists/${checklistId}/fotos`, {
      token: tokenAdmin,
      corpo: {
        item_chave: 'freio',
        legenda: 'Pedal de freio',
        dados: FOTO_DATA_URL
      }
    })

    assert.equal(envio.status, 201)
    const foto = envio.corpo.dados
    assert.equal(foto.item_chave, 'freio')
    assert.equal(foto.mime, 'image/jpeg')
    assert.ok(foto.url.startsWith('/uploads/'))

    // O arquivo existe fisicamente na pasta de uploads.
    const nomeArquivo = path.basename(foto.url)
    const caminho = path.join(PASTA_UPLOADS, nomeArquivo)
    assert.ok(fs.existsSync(caminho), 'o arquivo da foto deveria existir em disco')
    assert.equal(fs.statSync(caminho).size, foto.tamanho)

    // O nome é gerado pelo servidor (UUID), nunca vindo do cliente.
    assert.match(nomeArquivo, /^[0-9a-f-]{36}\.jpg$/i)

    // A URL retornada realmente serve a imagem.
    const baixada = await fetch(base + foto.url)
    assert.equal(baixada.status, 200)
    assert.equal(baixada.headers.get('content-type'), 'image/jpeg')
    const bytes = Buffer.from(await baixada.arrayBuffer())
    assert.deepEqual(bytes, Buffer.from(JPEG_BASE64, 'base64'))
  })

  it('aceita base64 puro, sem cabeçalho data URL', async () => {
    const criado = await criarChecklist()
    const { status, corpo } = await api(`POST`, `/api/checklists/${criado.corpo.dados.id}/fotos`, {
      token: tokenAdmin,
      corpo: { dados: JPEG_BASE64, legenda: 'Sem cabeçalho' }
    })
    assert.equal(status, 201)
    assert.equal(corpo.dados.mime, 'image/jpeg')
    assert.equal(corpo.dados.item_chave, null)
  })

  it('recusa conteúdo que não é imagem', async () => {
    const criado = await criarChecklist()
    const naoImagem = Buffer.from('isto aqui e apenas texto puro').toString('base64')
    const { status, corpo } = await api('POST', `/api/checklists/${criado.corpo.dados.id}/fotos`, {
      token: tokenAdmin,
      corpo: { dados: naoImagem }
    })
    assert.equal(status, 400)
    assert.equal(corpo.erro.codigo, 'VALIDACAO')
  })

  it('recusa item_chave inexistente na foto', async () => {
    const criado = await criarChecklist()
    const { status } = await api('POST', `/api/checklists/${criado.corpo.dados.id}/fotos`, {
      token: tokenAdmin,
      corpo: { item_chave: 'nao_existe', dados: FOTO_DATA_URL }
    })
    assert.equal(status, 400)
  })

  it('cria o checklist com fotos no mesmo POST e as vincula ao item', async () => {
    const { status, corpo } = await criarChecklist({
      itens: todosOk({ pneus: 'NC' }),
      fotos: [{ item_chave: 'pneus', legenda: 'Sulco abaixo do mínimo', dados: FOTO_DATA_URL }]
    })

    assert.equal(status, 201)
    assert.equal(corpo.dados.fotos.length, 1)
    assert.equal(corpo.dados.total_fotos ?? corpo.dados.fotos.length, 1)

    const pneus = corpo.dados.itens.find((i) => i.chave === 'pneus')
    assert.equal(pneus.fotos.length, 1)
    assert.ok(fs.existsSync(path.join(PASTA_UPLOADS, path.basename(pneus.fotos[0].url))))
  })

  it('lista as fotos de um checklist', async () => {
    const criado = await criarChecklist({
      fotos: [{ legenda: 'Frente', dados: FOTO_DATA_URL }]
    })
    const { status, corpo } = await api(
      'GET',
      `/api/checklists/${criado.corpo.dados.id}/fotos`,
      { token: tokenAdmin }
    )
    assert.equal(status, 200)
    assert.equal(corpo.dados.length, 1)
    assert.equal(corpo.dados[0].legenda, 'Frente')
  })

  it('excluir a foto remove também o arquivo do disco', async () => {
    const criado = await criarChecklist({
      fotos: [{ legenda: 'Para remover', dados: FOTO_DATA_URL }]
    })
    const foto = criado.corpo.dados.fotos[0]
    const caminho = path.join(PASTA_UPLOADS, path.basename(foto.url))
    assert.ok(fs.existsSync(caminho), 'a foto deveria existir antes da exclusão')

    const { status, corpo } = await api('DELETE', `/api/fotos/${foto.id}`, { token: tokenAdmin })
    assert.equal(status, 200)
    assert.equal(corpo.dados.removida, true)

    assert.equal(fs.existsSync(caminho), false, 'o arquivo deveria ter sido apagado')

    // O registro também sumiu da listagem.
    const restantes = await api('GET', `/api/checklists/${criado.corpo.dados.id}/fotos`, {
      token: tokenAdmin
    })
    assert.equal(restantes.corpo.dados.length, 0)
  })
})

// --------------------------------------------------------------------------
// 8. Permissões
// --------------------------------------------------------------------------
describe('Permissões', () => {
  it('operador não consegue excluir checklist (403)', async () => {
    const criado = await criarChecklist({}, tokenOperador)
    assert.equal(criado.status, 201)

    const { status, corpo } = await api('DELETE', `/api/checklists/${criado.corpo.dados.id}`, {
      token: tokenOperador
    })
    assert.equal(status, 403)
    assert.equal(corpo.erro.codigo, 'SEM_PERMISSAO')
  })

  it('operador não acessa a gestão de usuários (403)', async () => {
    const { status, corpo } = await api('GET', '/api/usuarios', { token: tokenOperador })
    assert.equal(status, 403)
    assert.equal(corpo.erro.codigo, 'SEM_PERMISSAO')
  })

  it('admin consegue excluir checklist e as fotos somem do disco', async () => {
    const criado = await criarChecklist({
      fotos: [{ legenda: 'Some junto', dados: FOTO_DATA_URL }]
    })
    const caminho = path.join(
      PASTA_UPLOADS,
      path.basename(criado.corpo.dados.fotos[0].url)
    )

    const { status } = await api('DELETE', `/api/checklists/${criado.corpo.dados.id}`, {
      token: tokenAdmin
    })
    assert.ok(status === 200 || status === 204)
    assert.equal(fs.existsSync(caminho), false)

    const busca = await api('GET', `/api/checklists/${criado.corpo.dados.id}`, {
      token: tokenAdmin
    })
    assert.equal(busca.status, 404)
  })

  it('o responsável gravado é sempre o usuário do token', async () => {
    const criado = await criarChecklist({ usuario_id: 1 }, tokenOperador)
    assert.equal(criado.corpo.dados.responsavel.nome, 'Operador de Pátio')
  })
})

// --------------------------------------------------------------------------
// 9. Exportação CSV
// --------------------------------------------------------------------------
describe('Exportação CSV', () => {
  it('começa com BOM UTF-8 e usa ponto e vírgula', async () => {
    const resposta = await fetch(base + '/api/exportar/csv', {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    })

    assert.equal(resposta.status, 200)
    assert.match(resposta.headers.get('content-type'), /text\/csv/)
    assert.match(resposta.headers.get('content-disposition'), /attachment/)

    const bytes = Buffer.from(await resposta.arrayBuffer())
    // BOM UTF-8 = EF BB BF — é o que faz o Excel pt-BR abrir com acentos certos.
    assert.deepEqual(bytes.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]))

    const texto = bytes.toString('utf8')
    const cabecalho = texto.replace(/^﻿/, '').split(/\r?\n/)[0]
    assert.ok(cabecalho.includes(';'), 'o separador deve ser ponto e vírgula')
    assert.ok(cabecalho.includes('Placa'))
    assert.ok(cabecalho.includes('Situação'))
    assert.ok(cabecalho.includes('Responsável'))
    assert.ok(cabecalho.includes('Decisão do responsável'))
    // Reforço da regra de negócio: não existe coluna de motorista.
    assert.equal(/motorista/i.test(texto), false)
  })

  it('exige autenticação', async () => {
    const { status } = await api('GET', '/api/exportar/csv', { cru: true })
    assert.equal(status, 401)
  })
})

// --------------------------------------------------------------------------
// 10. Relatórios
// --------------------------------------------------------------------------
describe('Relatórios', () => {
  it('resumo traz os totais por situação', async () => {
    const { status, corpo } = await api('GET', '/api/relatorios/resumo', { token: tokenAdmin })
    assert.equal(status, 200)
    assert.equal(typeof corpo.dados.total_checklists, 'number')
    assert.equal(
      corpo.dados.aprovados + corpo.dados.restricoes + corpo.dados.reprovados,
      corpo.dados.total_checklists
    )
    assert.ok(Array.isArray(corpo.dados.por_dia))
  })

  it('ranking de não conformidades vem ordenado', async () => {
    const { status, corpo } = await api('GET', '/api/relatorios/nao-conformidades?limite=5', {
      token: tokenAdmin
    })
    assert.equal(status, 200)
    assert.ok(Array.isArray(corpo.dados))
    assert.ok(corpo.dados.length <= 5)
    for (let i = 1; i < corpo.dados.length; i++) {
      assert.ok(corpo.dados[i - 1].total >= corpo.dados[i].total)
    }
  })
})

// --------------------------------------------------------------------------
// 11. Auditoria
// --------------------------------------------------------------------------
describe('Auditoria', () => {
  it('exige autenticação', async () => {
    const { status } = await api('GET', '/api/auditoria')
    assert.equal(status, 401)
  })

  it('operador não acessa a auditoria (403)', async () => {
    const { status, corpo } = await api('GET', '/api/auditoria', { token: tokenOperador })
    assert.equal(status, 403)
    assert.equal(corpo.erro.codigo, 'SEM_PERMISSAO')
  })

  it('admin lista os registros, mais recentes primeiro', async () => {
    const { status, corpo } = await api('GET', '/api/auditoria?limite=100', { token: tokenAdmin })
    assert.equal(status, 200)
    assert.ok(Array.isArray(corpo.dados))
    assert.ok(corpo.dados.length > 0, 'os testes anteriores já geraram auditoria')
    assert.ok(corpo.paginacao.total >= corpo.dados.length)

    for (let i = 1; i < corpo.dados.length; i++) {
      assert.ok(corpo.dados[i - 1].criado_em >= corpo.dados[i].criado_em)
    }
  })

  it('o detalhe volta como objeto, não como texto JSON', async () => {
    const criado = await criarChecklist({ aprovacao: 'APROVADO' })
    const { corpo } = await api('GET', '/api/auditoria?acao=criar&entidade=checklist&limite=1', {
      token: tokenAdmin
    })
    const registro = corpo.dados[0]

    assert.equal(registro.entidade_id, criado.corpo.dados.id)
    assert.equal(typeof registro.detalhe, 'object')
    assert.equal(registro.detalhe.aprovacao, 'APROVADO')
  })

  it('registra quem criou o checklist, com nome e e-mail', async () => {
    const { corpo } = await api('GET', '/api/auditoria?acao=criar&entidade=checklist&limite=1', {
      token: tokenAdmin
    })
    assert.equal(corpo.dados[0].usuario.email, 'admin@transporte.com')
  })

  it('login que falha fica registrado sem usuário identificado', async () => {
    await api('POST', '/api/auth/login', {
      corpo: { email: 'admin@transporte.com', senha: 'senha-errada-de-proposito' }
    })

    const { corpo } = await api('GET', '/api/auditoria?acao=login-falha&limite=1', {
      token: tokenAdmin
    })
    assert.equal(corpo.dados.length, 1)
    assert.equal(corpo.dados[0].usuario, null)
    assert.equal(corpo.dados[0].detalhe.email, 'admin@transporte.com')
  })

  it('filtra por ação', async () => {
    const { corpo } = await api('GET', '/api/auditoria?acao=login&limite=100', {
      token: tokenAdmin
    })
    assert.ok(corpo.dados.length > 0)
    // 'login-falha' não pode entrar num filtro por 'login': a comparação é exata.
    for (const registro of corpo.dados) assert.equal(registro.acao, 'login')
  })

  it('busca encontra pelo conteúdo do detalhe', async () => {
    const { corpo } = await api('GET', '/api/auditoria?busca=admin@transporte.com&limite=100', {
      token: tokenAdmin
    })
    assert.ok(corpo.dados.length > 0)
  })

  it('recusa data inválida no filtro com 400', async () => {
    const { status, corpo } = await api('GET', '/api/auditoria?de=20-07-2026', {
      token: tokenAdmin
    })
    assert.equal(status, 400)
    assert.equal(corpo.erro.codigo, 'VALIDACAO')
  })

  it('período futuro não devolve nada', async () => {
    const { corpo } = await api('GET', '/api/auditoria?de=2099-01-01', { token: tokenAdmin })
    assert.equal(corpo.dados.length, 0)
    assert.equal(corpo.paginacao.total, 0)
  })

  it('opções de filtro trazem ações, objetos e usuários com contagem', async () => {
    const { status, corpo } = await api('GET', '/api/auditoria/opcoes', { token: tokenAdmin })
    assert.equal(status, 200)
    assert.ok(corpo.dados.acoes.some((a) => a.valor === 'login' && a.total > 0))
    assert.ok(corpo.dados.entidades.some((e) => e.valor === 'checklist'))
    assert.ok(corpo.dados.usuarios.some((u) => u.total > 0))
    assert.ok(corpo.dados.total > 0)
  })

  it('a trilha é somente leitura: não existe rota de escrita', async () => {
    for (const metodo of ['POST', 'PUT', 'DELETE']) {
      const { status } = await api(metodo, '/api/auditoria/1', {
        token: tokenAdmin,
        corpo: metodo === 'DELETE' ? undefined : { acao: 'forjada' }
      })
      assert.equal(status, 404, `${metodo} não deveria existir`)
    }
  })
})
