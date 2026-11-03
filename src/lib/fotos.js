// Gravação de fotos enviadas como base64 / data URL.
// O nome do arquivo é SEMPRE gerado pelo servidor — nada vindo do cliente.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import config from '../config.js'
import { ErroApi } from './respostas.js'

const TIPOS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

const APELIDOS = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' }

const CABECALHO_DATA_URL = /^data:([a-z0-9.+/-]+);base64,/i

/** Identifica o tipo real pelos primeiros bytes do arquivo. */
function tipoReal(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/**
 * Decodifica, valida e grava a foto em config.UPLOAD_DIR.
 * itemChave é usado apenas para apontar o campo com erro na resposta.
 */
export function salvarFoto({ dados, itemChave = null }) {
  const campo = itemChave ? `fotos.${itemChave}` : 'dados'

  if (typeof dados !== 'string' || dados.trim() === '') {
    throw new ErroApi('VALIDACAO', 'A imagem não foi enviada.', 400, {
      [campo]: 'obrigatório'
    })
  }

  const bruto = dados.trim()
  const cabecalho = bruto.match(CABECALHO_DATA_URL)

  let mimeDeclarado = null
  if (cabecalho) {
    const declarado = cabecalho[1].toLowerCase()
    mimeDeclarado = APELIDOS[declarado] ?? declarado
    if (!TIPOS[mimeDeclarado]) {
      throw new ErroApi(
        'VALIDACAO',
        'Formato de imagem não aceito. Envie JPEG, PNG ou WebP.',
        400,
        { [campo]: 'formato inválido' }
      )
    }
  }

  const base64 = cabecalho ? bruto.slice(cabecalho[0].length) : bruto
  if (!/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(base64)) {
    throw new ErroApi('VALIDACAO', 'Conteúdo da imagem inválido.', 400, {
      [campo]: 'base64 inválido'
    })
  }

  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) {
    throw new ErroApi('VALIDACAO', 'A imagem está vazia.', 400, {
      [campo]: 'conteúdo vazio'
    })
  }

  const limite = config.MAX_FOTO_MB * 1024 * 1024
  if (buffer.length > limite) {
    throw new ErroApi(
      'PAYLOAD_GRANDE',
      `Imagem acima do limite de ${config.MAX_FOTO_MB} MB.`,
      413,
      { [campo]: 'arquivo muito grande' }
    )
  }

  // Confere a assinatura binária: o tipo declarado pode ser forjado.
  const real = tipoReal(buffer)
  if (!real) {
    throw new ErroApi(
      'VALIDACAO',
      'Arquivo não é uma imagem válida. Envie JPEG, PNG ou WebP.',
      400,
      { [campo]: 'formato inválido' }
    )
  }
  if (mimeDeclarado && mimeDeclarado !== real) {
    throw new ErroApi(
      'VALIDACAO',
      'O conteúdo da imagem não corresponde ao formato informado.',
      400,
      { [campo]: 'formato divergente' }
    )
  }

  const arquivo = `${randomUUID()}${TIPOS[real]}`
  fs.writeFileSync(path.join(config.UPLOAD_DIR, arquivo), buffer)

  return { arquivo, mime: real, tamanho: buffer.length }
}

/** Apaga o arquivo do disco. Nunca lança: o registro no banco é o que manda. */
export function removerArquivo(arquivo) {
  if (typeof arquivo !== 'string' || arquivo.trim() === '') return false
  // basename impede que um nome manipulado escape da pasta de uploads.
  const alvo = path.join(config.UPLOAD_DIR, path.basename(arquivo))
  try {
    fs.unlinkSync(alvo)
    return true
  } catch {
    return false
  }
}

export function urlDaFoto(arquivo) {
  return `/uploads/${arquivo}`
}
