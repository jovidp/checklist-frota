// Script: npm run seed — dados iniciais. Pode ser executado várias vezes.
import { randomBytes } from 'node:crypto'
import config from '../config.js'
import { consultar, consultarUm, executar, transacao, garantirBanco, fechar } from './index.js'
import { gerarHash } from '../lib/senha.js'

const VEICULOS_EXEMPLO = [
  {
    placa: 'ABC1D23',
    frota: '08',
    modelo: 'Constellation 24.280',
    marca: 'Volkswagen',
    ano: 2019,
    tipo_carroceria: 'Baú',
    possui_lona: 0
  },
  {
    placa: 'DEF2G34',
    frota: '12',
    modelo: 'Atego 2426',
    marca: 'Mercedes-Benz',
    ano: 2021,
    tipo_carroceria: 'Carga seca',
    possui_lona: 1
  },
  {
    placa: 'GHI3J45',
    frota: '21',
    modelo: 'Cargo 1719',
    marca: 'Ford',
    ano: 2017,
    tipo_carroceria: 'Graneleiro',
    possui_lona: 0
  }
]

// Senha do administrador: a definida em ADMIN_SENHA ou, na falta dela, uma
// senha aleatória marcada como provisória — o sistema exige a troca no
// primeiro acesso e ela é exibida uma única vez, aqui no console.
const SENHA_GERADA = config.ADMIN_SENHA === null
const SENHA_ADMIN = config.ADMIN_SENHA ?? randomBytes(12).toString('base64url')

console.log('\n=== Carga de dados iniciais ===\n')

try {
  if (garantirBanco()) console.log('Banco criado a partir do esquema.\n')

  const resumo = transacao(() => {
    // --- Administrador ---
    let admin = consultarUm('SELECT id FROM usuarios WHERE email = ?', config.ADMIN_EMAIL)
    let adminCriado = false
    if (!admin) {
      const r = executar(
        `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, senha_provisoria)
         VALUES (?, ?, ?, 'admin', 1, ?)`,
        'Administração do Transporte',
        config.ADMIN_EMAIL,
        gerarHash(SENHA_ADMIN),
        SENHA_GERADA ? 1 : 0
      )
      admin = { id: r.id }
      adminCriado = true
    }

    // --- Veículos de exemplo (apenas se a tabela estiver vazia) ---
    const { total: totalVeiculos } = consultarUm('SELECT COUNT(*) AS total FROM veiculos')
    let veiculosCriados = 0
    if (totalVeiculos === 0) {
      for (const v of VEICULOS_EXEMPLO) {
        executar(
          `INSERT INTO veiculos (placa, frota, modelo, marca, ano, tipo_carroceria, possui_lona, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          v.placa, v.frota, v.modelo, v.marca, v.ano, v.tipo_carroceria, v.possui_lona
        )
        veiculosCriados += 1
      }
    }

    return { adminCriado, veiculosCriados, totalVeiculos }
  })

  // --- Catálogo de itens (vem do próprio schema.sql, aqui só conferimos) ---
  const itens = consultar(
    'SELECT chave, nome, critico FROM itens_catalogo WHERE ativo = 1 ORDER BY ordem'
  )

  console.log(
    resumo.adminCriado
      ? 'Usuário administrador criado.'
      : 'Usuário administrador já existia — mantido como está.'
  )
  console.log(
    resumo.veiculosCriados > 0
      ? `${resumo.veiculosCriados} veículos de exemplo cadastrados.`
      : `Veículos já cadastrados (${resumo.totalVeiculos}) — nenhum exemplo adicionado.`
  )

  const criticos = itens.filter((i) => i.critico === 1).length
  console.log(`Catálogo de itens: ${itens.length} itens ativos (${criticos} críticos).`)

  console.log('\n--- Credenciais de acesso ---')
  console.log(`  E-mail: ${config.ADMIN_EMAIL}`)
  if (!resumo.adminCriado) {
    console.log('  Senha:  inalterada — o usuário já existia.\n')
  } else if (SENHA_GERADA) {
    console.log(`  Senha provisória: ${SENHA_ADMIN}`)
    console.log('  Anote agora: ela não será exibida novamente.')
    console.log('  O sistema exigirá a troca desta senha no primeiro acesso.\n')
  } else {
    console.log('  Senha:  a definida em ADMIN_SENHA no arquivo .env.')
    console.log('  Troque a senha após o primeiro acesso.\n')
  }
  console.log('Carga concluída.\n')
} catch (erro) {
  console.error('\nFalha na carga de dados:', erro.message, '\n')
  process.exitCode = 1
} finally {
  fechar()
}
