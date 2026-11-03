// Script: npm run recalcular — reprocessa o `status` dos checklists já
// gravados com a regra atual de lib/status.js (a decisão do responsável manda).
//
// Necessário porque `status` é desnormalizado: fica gravado na linha do
// checklist e não se atualiza sozinho quando a regra muda. Idempotente —
// rodar de novo sem mudanças não altera nada.
import { consultar, executar, transacao, garantirBanco, fechar } from './index.js'
import { calcularStatus } from '../lib/status.js'

console.log('\n=== Recálculo do status dos checklists ===\n')

try {
  garantirBanco()

  const catalogo = consultar(
    'SELECT chave, critico FROM itens_catalogo WHERE ativo = 1'
  )

  const checklists = consultar(
    `SELECT id, aprovacao, lona_possui, lona_condicao, status
       FROM checklists
      ORDER BY id ASC`
  )

  const mudancas = []

  transacao(() => {
    for (const c of checklists) {
      const itens = consultar(
        'SELECT item_chave AS chave, status FROM checklist_itens WHERE checklist_id = ?',
        c.id
      )

      const { status, totais } = calcularStatus({
        itens,
        catalogo,
        lonaPossui: c.lona_possui === 1,
        lonaCondicao: c.lona_condicao,
        aprovacao: c.aprovacao
      })

      if (status !== c.status) mudancas.push({ id: c.id, de: c.status, para: status })

      // Os totais também são regravados: se o catálogo mudou desde o
      // lançamento, os contadores antigos não batem mais com ele.
      executar(
        `UPDATE checklists
            SET status = ?, total_ok = ?, total_nc = ?, total_na = ?, total_pendente = ?
          WHERE id = ?`,
        status,
        totais.ok,
        totais.nc,
        totais.na,
        totais.pendente,
        c.id
      )
    }
  })

  console.log(`Checklists processados: ${checklists.length}`)
  console.log(`Status alterados:       ${mudancas.length}\n`)

  for (const m of mudancas) {
    console.log(`  #${String(m.id).padStart(4)}  ${m.de.padEnd(9)} -> ${m.para}`)
  }

  const semDecisao = checklists.filter((c) => !c.aprovacao).length
  if (semDecisao > 0) {
    console.log(
      `\nAviso: ${semDecisao} checklist(s) sem decisão gravada (anteriores ao campo).` +
      '\nNesses o status continua vindo só dos itens. Edite e salve para registrar a decisão.'
    )
  }

  console.log('\nRecálculo concluído.\n')
} catch (erro) {
  console.error('\nFalha no recálculo:', erro.message, '\n')
  process.exitCode = 1
} finally {
  fechar()
}
