// Padronização das respostas da API conforme docs/API.md.

/** Erro de negócio já traduzido para o cliente. */
export class ErroApi extends Error {
  constructor(codigo, mensagem, status = 400, campos = null) {
    super(mensagem)
    this.name = 'ErroApi'
    this.codigo = codigo
    this.status = status
    this.campos = campos
  }
}

export function ok(res, dados, extra = {}) {
  return res.json({ ok: true, dados, ...extra })
}

export function criado(res, dados) {
  return res.status(201).json({ ok: true, dados })
}

export function semConteudo(res) {
  return res.status(204).end()
}

// Os atalhos abaixo LANÇAM o erro. Assim funcionam tanto escritos como
// "throw naoEncontrado(...)" quanto chamados diretamente, sem falhar em silêncio.

export function erroValidacao(mensagem = 'Dados inválidos.', campos = null) {
  throw new ErroApi('VALIDACAO', mensagem, 400, campos)
}

export function naoEncontrado(mensagem = 'Registro não encontrado.') {
  throw new ErroApi('NAO_ENCONTRADO', mensagem, 404)
}

export function conflito(mensagem = 'Registro já cadastrado.', campos = null) {
  throw new ErroApi('CONFLITO', mensagem, 409, campos)
}

export function semPermissao(mensagem = 'Você não tem permissão para esta ação.') {
  throw new ErroApi('SEM_PERMISSAO', mensagem, 403)
}

export function naoAutenticado(mensagem = 'Autenticação necessária.') {
  throw new ErroApi('NAO_AUTENTICADO', mensagem, 401)
}

/** Encaminha rejeições de handlers async para o middleware de erro. */
export function assincrono(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
