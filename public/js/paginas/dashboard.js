/**
 * dashboard.js — página inicial do painel.
 * Junta em uma tela: indicadores do período, alertas de documentação
 * vencida/a vencer e os últimos checklists lançados.
 */

import { api } from '../api.js';
import {
  elemento, escapar, formatarData, formatarNumero,
  spinner, ROTULO_STATUS
} from '../util.js';

/* Estilos exclusivos desta página (o design system não tem atalho gigante
   nem lista de alertas). Injetados uma única vez por sessão. */
const ID_ESTILO = 'estilo-dashboard';
const CSS = `
.atalho-novo {
  display: flex; align-items: center; gap: var(--esp-4);
  padding: var(--esp-5) var(--esp-4);
  margin-bottom: var(--esp-4);
  background: var(--petroleo-600);
  color: #fff;
  border: 1px solid var(--petroleo-600);
  border-radius: var(--raio-lg);
  box-shadow: var(--sombra-2);
  text-decoration: none;
  transition: background var(--transicao), transform var(--transicao);
}
.atalho-novo:hover { background: var(--petroleo-500); }
.atalho-novo:active { transform: translateY(1px); }
.atalho-novo:focus-visible { outline: none; box-shadow: var(--foco); }
.atalho-icone { font-size: 2.2rem; line-height: 1; flex: none; }
.atalho-texto { flex: 1; min-width: 0; }
.atalho-texto strong { display: block; font-size: 1.15rem; font-weight: 700; }
.atalho-texto span { font-size: .88rem; opacity: .88; }
.atalho-seta { font-size: 1.5rem; line-height: 1; flex: none; opacity: .85; }

.lista-alertas { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--esp-2); }
.alerta-linha {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-2) var(--esp-3);
  padding: var(--esp-3);
  border: 1px solid var(--neutro-borda);
  border-left: 4px solid var(--neutro);
  border-radius: var(--raio);
  background: var(--neutro-suave);
}
.alerta-linha.vencido {
  border-color: var(--vermelho-borda); border-left-color: var(--vermelho);
  background: var(--vermelho-suave);
}
.alerta-linha.a-vencer {
  border-color: var(--ambar-borda); border-left-color: var(--ambar);
  background: var(--ambar-suave);
}
.alerta-linha .placa { font-size: .95rem; }
.alerta-doc { font-weight: 650; font-size: .9rem; }
.alerta-prazo { margin-left: auto; font-size: .85rem; font-weight: 700; }
.alerta-linha.vencido  .alerta-prazo, .alerta-linha.vencido  .alerta-doc { color: var(--vermelho); }
.alerta-linha.a-vencer .alerta-prazo, .alerta-linha.a-vencer .alerta-doc { color: var(--ambar); }

.lista-recentes { list-style: none; margin: 0; padding: 0; }
.recente-item {
  display: flex; align-items: center; gap: var(--esp-3);
  padding: var(--esp-3) var(--esp-2);
  border-bottom: 1px solid var(--borda);
  color: inherit; text-decoration: none;
}
.recente-item:last-child { border-bottom: 0; }
.recente-item:hover { background: var(--fundo-alt); }
.recente-corpo { flex: 1; min-width: 0; }
.recente-seta { color: var(--texto-fraco); flex: none; }
`;

function injetarEstilo() {
  if (document.getElementById(ID_ESTILO)) return;
  const tag = elemento('style', { id: ID_ESTILO }, [CSS]);
  document.head.appendChild(tag);
}

/** Chip colorido do status do checklist, reaproveitando os chips do sistema. */
function chipSituacao(status) {
  const chave = String(status || '').toLowerCase();
  return elemento('span', { class: `chip chip-${chave || 'na'}` }, [
    ROTULO_STATUS[status] || status || '—'
  ]);
}

/** Texto do prazo em linguagem natural — o número sozinho confunde. */
function textoPrazo(dias) {
  const n = Number(dias);
  if (!Number.isFinite(n)) return '—';
  if (n < 0) return `Vencido há ${formatarNumero(Math.abs(n))} dia(s)`;
  if (n === 0) return 'Vence hoje';
  return `Vence em ${formatarNumero(n)} dia(s)`;
}

function cartaoIndicador(rotulo, valor, nota, modificador) {
  return elemento('div', { class: `indicador${modificador ? ' ' + modificador : ''}` }, [
    elemento('div', { class: 'indicador-rotulo' }, [rotulo]),
    elemento('div', { class: 'indicador-valor' }, [formatarNumero(valor ?? 0)]),
    nota ? elemento('div', { class: 'indicador-nota' }, [nota]) : null
  ]);
}

function blocoErro(mensagem, aoTentar) {
  return elemento('div', { class: 'vazio' }, [
    elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
    elemento('h3', {}, ['Não foi possível carregar']),
    elemento('p', {}, [mensagem || 'Tente novamente em instantes.']),
    aoTentar
      ? elemento('button', { type: 'button', class: 'btn btn-secundario', onclick: aoTentar }, ['Tentar novamente'])
      : null
  ]);
}

export default async function render(container) {
  injetarEstilo();

  const usuario = api.usuarioAtual();
  const primeiroNome = (usuario?.nome || '').trim().split(/\s+/)[0] || '';

  const topo = elemento('div', { class: 'pagina-topo' }, [
    elemento('div', {}, [
      elemento('h1', {}, [primeiroNome ? `Olá, ${primeiroNome}` : 'Painel']),
      elemento('p', { class: 'pagina-sub', id: 'dash-periodo' }, ['Visão geral dos últimos 30 dias.'])
    ]),
    elemento('div', { class: 'barra-acoes' }, [
      elemento('a', { class: 'btn btn-secundario', href: '#/historico' }, ['Ver histórico']),
      elemento('a', { class: 'btn btn-secundario', href: '#/relatorios' }, ['Relatórios'])
    ])
  ]);

  const atalho = elemento('a', { class: 'atalho-novo', href: '#/novo' }, [
    elemento('span', { class: 'atalho-icone', 'aria-hidden': 'true' }, ['🚚']),
    elemento('div', { class: 'atalho-texto' }, [
      elemento('strong', {}, ['Novo checklist']),
      elemento('span', {}, ['Inicie a inspeção de um veículo agora mesmo.'])
    ]),
    elemento('span', { class: 'atalho-seta', 'aria-hidden': 'true' }, ['›'])
  ]);

  const areaIndicadores = elemento('section', { 'aria-label': 'Indicadores do período' });
  const areaAlertas = elemento('section', { class: 'card', 'aria-label': 'Alertas de documentação' });
  const areaRecentes = elemento('section', { class: 'card', 'aria-label': 'Últimos checklists' });

  const subtitulo = topo.querySelector('#dash-periodo');

  container.replaceChildren(topo, atalho, areaIndicadores, areaAlertas, areaRecentes);

  /* ------------------------------------------------------------ carregamento
     Os três blocos são independentes: usamos allSettled para que a falha de
     um deles não apague os outros da tela. */

  async function carregar() {
    spinner(areaIndicadores, 'Carregando indicadores…');
    spinner(areaAlertas, 'Verificando documentação…');
    spinner(areaRecentes, 'Carregando checklists…');

    const [resumo, alertas, recentes] = await Promise.allSettled([
      api.get('/relatorios/resumo'),
      api.get('/relatorios/alertas'),
      api.get('/checklists', { pagina: 1, limite: 5 })
    ]);

    // 401 já derrubou a sessão em api.js; não vale redesenhar nada.
    const expirou = [resumo, alertas, recentes]
      .some((r) => r.status === 'rejected' && r.reason?.codigo === 'NAO_AUTENTICADO');
    if (expirou) return;

    montarIndicadores(resumo);
    montarAlertas(alertas);
    montarRecentes(recentes);
  }

  /* ------------------------------------------------------------ indicadores */

  function montarIndicadores(resultado) {
    if (resultado.status === 'rejected') {
      areaIndicadores.replaceChildren(blocoErro(resultado.reason?.mensagem, carregar));
      return;
    }

    const dados = resultado.value || {};
    const periodo = dados.periodo || {};
    if (periodo.de && periodo.ate) {
      subtitulo.textContent =
        `Período de ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}.`;
    }

    const total = Number(dados.total_checklists || 0);
    const proporcao = (valor) => (total > 0
      ? `${Math.round((Number(valor || 0) / total) * 100)}% do período`
      : 'Nenhum registro no período');

    areaIndicadores.replaceChildren(
      elemento('div', { class: 'grade grade-4' }, [
        cartaoIndicador('Checklists', total, 'No período selecionado'),
        cartaoIndicador('Aprovados', dados.aprovados, proporcao(dados.aprovados), 'ok'),
        cartaoIndicador('Com restrição', dados.restricoes, proporcao(dados.restricoes), 'restricao'),
        cartaoIndicador('Reprovados', dados.reprovados, proporcao(dados.reprovados), 'reprovado'),
        cartaoIndicador('Veículos ativos', dados.veiculos_ativos, 'Frota cadastrada'),
        cartaoIndicador('Não conformidades', dados.total_nao_conformidades, 'Itens marcados como NC', 'reprovado')
      ])
    );
  }

  /* ---------------------------------------------------------------- alertas */

  function montarAlertas(resultado) {
    const cabecalho = elemento('div', { class: 'card-topo' }, [
      elemento('h2', {}, ['Documentação']),
      elemento('span', { class: 'texto-pequeno texto-fraco' }, ['Com base no último checklist de cada veículo'])
    ]);

    if (resultado.status === 'rejected') {
      areaAlertas.replaceChildren(cabecalho, blocoErro(resultado.reason?.mensagem, carregar));
      return;
    }

    const lista = Array.isArray(resultado.value) ? resultado.value : [];

    if (!lista.length) {
      areaAlertas.replaceChildren(cabecalho, elemento('div', { class: 'vazio' }, [
        elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['✅']),
        elemento('h3', {}, ['Documentação em dia']),
        elemento('p', {}, ['Nenhum CRLV ou tacógrafo vencido ou a vencer nos próximos 30 dias.'])
      ]));
      return;
    }

    const vencidos = lista.filter((a) => a.vencido).length;
    const aVencer = lista.length - vencidos;

    const resumoTexto = [
      vencidos ? `${formatarNumero(vencidos)} vencido(s)` : null,
      aVencer ? `${formatarNumero(aVencer)} a vencer` : null
    ].filter(Boolean).join(' · ');

    cabecalho.replaceChildren(
      elemento('h2', {}, ['Documentação']),
      elemento('span', {
        class: `badge ${vencidos ? 'badge-critico' : 'badge-alerta'}`
      }, [resumoTexto])
    );

    const itens = lista.map((alerta) => {
      const critico = Boolean(alerta.vencido);
      return elemento('li', { class: `alerta-linha ${critico ? 'vencido' : 'a-vencer'}` }, [
        elemento('span', { class: 'placa' }, [alerta.placa || '—']),
        elemento('span', { class: 'alerta-doc' }, [alerta.documento || 'Documento']),
        elemento('span', { class: 'texto-pequeno texto-suave' }, [
          `Validade ${formatarData(alerta.validade)}`
        ]),
        elemento('span', { class: 'alerta-prazo' }, [textoPrazo(alerta.dias)])
      ]);
    });

    areaAlertas.replaceChildren(
      cabecalho,
      elemento('ul', { class: 'lista-alertas' }, itens)
    );
  }

  /* -------------------------------------------------------------- recentes */

  function montarRecentes(resultado) {
    const cabecalho = elemento('div', { class: 'card-topo' }, [
      elemento('h2', {}, ['Últimos checklists']),
      elemento('a', { class: 'btn btn-pequeno btn-fantasma', href: '#/historico' }, ['Ver todos'])
    ]);

    if (resultado.status === 'rejected') {
      areaRecentes.replaceChildren(cabecalho, blocoErro(resultado.reason?.mensagem, carregar));
      return;
    }

    const resposta = resultado.value;
    const lista = Array.isArray(resposta) ? resposta : (resposta?.dados || []);

    if (!lista.length) {
      areaRecentes.replaceChildren(cabecalho, elemento('div', { class: 'vazio' }, [
        elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['🗒️']),
        elemento('h3', {}, ['Nenhum checklist registrado']),
        elemento('p', {}, ['Assim que a primeira inspeção for lançada, ela aparecerá aqui.']),
        elemento('a', { class: 'btn btn-primario', href: '#/novo' }, ['Registrar checklist'])
      ]));
      return;
    }

    const itens = lista.map((item) => {
      const placa = item.veiculo?.placa || '—';
      const nc = Number(item.resumo?.nc || 0);

      // Texto vindo do banco escapado antes de virar HTML.
      const identificacao = `<span class="placa">${escapar(placa)}</span>`;

      return elemento('a', {
        class: 'recente-item',
        href: `#/historico/${item.id}`
      }, [
        elemento('div', { class: 'recente-corpo' }, [
          elemento('div', { html: identificacao }),
          elemento('div', { class: 'texto-pequeno texto-fraco' }, [
            `${formatarData(item.data)} ${item.hora || ''} · ${item.responsavel?.nome || 'Responsável não informado'}` +
            (nc > 0 ? ` · ${formatarNumero(nc)} não conformidade(s)` : '')
          ])
        ]),
        chipSituacao(item.status),
        elemento('span', { class: 'recente-seta', 'aria-hidden': 'true' }, ['›'])
      ]);
    });

    areaRecentes.replaceChildren(
      cabecalho,
      elemento('div', { class: 'lista-recentes' }, itens)
    );
  }

  await carregar();
}
