// Hash de senha com scrypt do node:crypto — sem dependências externas.
// Formato armazenado: "scrypt$<custo>$<saltHex>$<hashHex>"
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

const CUSTO = 16384 // parâmetro N do scrypt
const TAMANHO_SALT = 16
const TAMANHO_HASH = 64

export function gerarHash(senha) {
  if (typeof senha !== 'string' || senha.length === 0) {
    throw new Error('Senha inválida para geração de hash.')
  }
  const salt = randomBytes(TAMANHO_SALT)
  const hash = scryptSync(senha, salt, TAMANHO_HASH, { N: CUSTO, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${CUSTO}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function conferir(senha, armazenado) {
  if (typeof senha !== 'string' || typeof armazenado !== 'string') return false

  const partes = armazenado.split('$')
  if (partes.length !== 4 || partes[0] !== 'scrypt') return false

  const custo = Number(partes[1])
  if (!Number.isInteger(custo) || custo <= 0) return false

  try {
    const salt = Buffer.from(partes[2], 'hex')
    const esperado = Buffer.from(partes[3], 'hex')
    const calculado = scryptSync(senha, salt, esperado.length, {
      N: custo,
      maxmem: 64 * 1024 * 1024
    })
    // Comparação de tempo constante evita vazamento por temporização.
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado)
  } catch {
    return false
  }
}
