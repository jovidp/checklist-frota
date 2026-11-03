// Rotas de autenticação — seção 1 do docs/API.md.
import express from 'express'
import { randomUUID } from 'node:crypto'
import config from '../config.js'
import { ok, assincrono, ErroApi } from '../lib/respostas.js'
import { assinar } from '../lib/jwt.js'
import { conferir, gerarHash } from '../lib/senha.js'
import { autenticar } from '../middleware/auth.js'
import { registrar } from '../lib/auditoria.js'
import { exigir } from '../lib/validacao.js'
import * as usuarios from '../services/usuarios.service.js'

const router = express.Router()

// Mensagem única para e-mail inexistente e senha errada: revelar qual dos
// dois falhou permitiria descobrir quais e-mails estão cadastrados.
const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos.'

// Hash descartável usado quando o e-mail não existe. Sem ele, a resposta
// voltaria muito mais rápido nesse caso e o tempo denunciaria os e-mails
// válidos — o scrypt é propositalmente lento.
const HASH_FICTICIO = gerarHash(randomUUID())

function credenciaisInvalidas() {
  return new ErroApi('NAO_AUTENTICADO', CREDENCIAIS_INVALIDAS, 401)
}

// Freio de força bruta. Sem ele, a senha padrão do seed cai em minutos para
// quem estiver na mesma rede. O contador fica em memória porque o processo é
// único; reiniciar o servidor zera as janelas, o que é aceitável aqui.
const MAX_TENTATIVAS = 5
const JANELA_MS = 15 * 60 * 1000
const tentativas = new Map()

/** A janela é por e-mail + IP: um atacante não trava a conta de terceiros. */
function chaveTentativa(req, email) {
  return `${String(email ?? '').trim().toLowerCase()}|${req.ip ?? ''}`
}

/** Descarta janelas vencidas para o Map não crescer sem limite. */
function limparVencidas(agora) {
  for (const [chave, registro] of tentativas) {
    if (registro.expiraEm <= agora) tentativas.delete(chave)
  }
}

/** Barra a requisição se a janela já estourou o limite de falhas. */
function conferirBloqueio(req, res, chave) {
  const agora = Date.now()
  limparVencidas(agora)

  const registro = tentativas.get(chave)
  if (!registro || registro.falhas < MAX_TENTATIVAS) return

  const segundos = Math.max(1, Math.ceil((registro.expiraEm - agora) / 1000))
  const minutos = Math.ceil(segundos / 60)
  res.setHeader('Retry-After', String(segundos))
  registrar(req, 'login-bloqueado', 'usuario', null, {
    email: String(req.body?.email ?? '').trim().toLowerCase(),
    falhas: registro.falhas
  })
  throw new ErroApi(
    'MUITAS_TENTATIVAS',
    `Muitas tentativas de login. Tente novamente em ${minutos} minuto(s).`,
    429
  )
}

/** Conta a falha e deixa rastro forense na auditoria. */
function registrarFalha(req, chave, email) {
  const agora = Date.now()
  const registro = tentativas.get(chave)

  if (!registro || registro.expiraEm <= agora) {
    tentativas.set(chave, { falhas: 1, expiraEm: agora + JANELA_MS })
  } else {
    registro.falhas += 1
  }

  registrar(req, 'login-falha', 'usuario', null, {
    email: String(email ?? '').trim().toLowerCase(),
    falhas: tentativas.get(chave).falhas
  })
}

/**
 * Dados do usuário devolvidos ao cliente após autenticar. Recebe tanto a
 * linha crua do banco (login) quanto o req.usuario do middleware (/eu),
 * por isso lê a marca de senha provisória nos dois formatos.
 */
function usuarioPublico(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    // O painel usa este campo para exigir a troca antes de abrir o sistema.
    senhaProvisoria: linha.senhaProvisoria ?? linha.senha_provisoria === 1
  }
}

// POST /api/auth/login — público
router.post(
  '/login',
  assincrono((req, res) => {
    const { email, senha } = req.body ?? {}
    exigir({ email, senha }, ['email', 'senha'])

    // Antes do scrypt: bloqueado não gasta CPU do servidor.
    const chave = chaveTentativa(req, email)
    conferirBloqueio(req, res, chave)

    const usuario = usuarios.buscarPorEmail(email)

    // Sempre conferimos uma senha, exista o usuário ou não.
    const senhaConfere = conferir(String(senha), usuario?.senha_hash ?? HASH_FICTICIO)
    if (!usuario || !senhaConfere) {
      registrarFalha(req, chave, email)
      throw credenciaisInvalidas()
    }

    // Conta desativada não entra, mesmo com a senha correta.
    if (usuario.ativo !== 1) {
      throw new ErroApi(
        'NAO_AUTENTICADO',
        'Este usuário está desativado. Procure o administrador do sistema.',
        401
      )
    }

    // Login válido limpa a janela: quem sabe a senha não fica de castigo.
    tentativas.delete(chave)

    const token = assinar({
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil
    })
    const expiraEm = new Date(
      Date.now() + config.JWT_EXPIRA_HORAS * 3600 * 1000
    ).toISOString()

    // A auditoria precisa saber quem entrou; req.usuario ainda não existe aqui.
    req.usuario = usuarioPublico(usuario)
    registrar(req, 'login', 'usuario', usuario.id, { email: usuario.email })

    ok(res, { token, expiraEm, usuario: usuarioPublico(usuario) })
  })
)

// GET /api/auth/eu — autenticado
router.get(
  '/eu',
  autenticar,
  assincrono((req, res) => {
    ok(res, usuarioPublico(req.usuario))
  })
)

// POST /api/auth/senha — autenticado
router.post(
  '/senha',
  autenticar,
  assincrono((req, res) => {
    const { senhaAtual, senhaNova } = req.body ?? {}
    exigir({ senhaAtual, senhaNova }, ['senhaAtual', 'senhaNova'])

    // Buscamos de novo porque req.usuario nunca carrega o senha_hash.
    const registro = usuarios.buscarPorEmail(req.usuario.email)
    if (!registro || !conferir(String(senhaAtual), registro.senha_hash)) {
      throw new ErroApi('VALIDACAO', 'A senha atual está incorreta.', 400, {
        senhaAtual: 'incorreta'
      })
    }

    if (String(senhaAtual) === String(senhaNova)) {
      throw new ErroApi('VALIDACAO', 'A nova senha deve ser diferente da atual.', 400, {
        senhaNova: 'igual à senha atual'
      })
    }

    usuarios.alterarSenha(req.usuario.id, senhaNova) // valida o mínimo de caracteres

    registrar(req, 'alterar-senha', 'usuario', req.usuario.id)
    ok(res, { alterada: true })
  })
)

export default router
