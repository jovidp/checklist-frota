// Tratamento central de erros — formato definido em docs/API.md.
import { ErroApi } from '../lib/respostas.js'

export function rotaNaoEncontrada(req, res) {
  res.status(404).json({
    ok: false,
    erro: {
      codigo: 'NAO_ENCONTRADO',
      mensagem: `Rota não encontrada: ${req.method} ${req.originalUrl}`
    }
  })
}

// A assinatura de 4 parâmetros é obrigatória para o Express reconhecer
// este middleware como tratador de erros.
export function tratarErros(erro, req, res, next) {
  if (res.headersSent) return next(erro)

  if (erro instanceof ErroApi) {
    const corpo = { codigo: erro.codigo, mensagem: erro.message }
    if (erro.campos) corpo.campos = erro.campos
    return res.status(erro.status || 400).json({ ok: false, erro: corpo })
  }

  // Corpo maior que o limite do express.json.
  if (erro?.type === 'entity.too.large' || erro?.status === 413) {
    return res.status(413).json({
      ok: false,
      erro: {
        codigo: 'PAYLOAD_GRANDE',
        mensagem: 'Envio muito grande. Reduza a quantidade ou o tamanho das fotos.'
      }
    })
  }

  // JSON malformado vindo do body-parser.
  if (erro instanceof SyntaxError && erro.status === 400 && 'body' in erro) {
    return res.status(400).json({
      ok: false,
      erro: { codigo: 'VALIDACAO', mensagem: 'JSON inválido no corpo da requisição.' }
    })
  }

  // Nada previsto: registra no servidor e devolve mensagem genérica,
  // sem expor detalhes internos ao cliente.
  console.error(`[erro] ${req.method} ${req.originalUrl}`)
  console.error(erro?.stack ?? erro)

  res.status(500).json({
    ok: false,
    erro: {
      codigo: 'ERRO_INTERNO',
      mensagem: 'Ocorreu um erro interno. Tente novamente em instantes.'
    }
  })
}
