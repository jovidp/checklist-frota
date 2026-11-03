/**
 * relatorios.js — análise do período: evolução diária, ranking de não
 * conformidades e consolidado por veículo. Todos os gráficos são HTML/CSS
 * puro (sem biblioteca), com o valor sempre disponível em texto.
 */

import { api } from '../api.js';
import {
  elemento, escapar, formatarData, formatarNumero,
  spinner, toast, hoje
} from '../util.js';

/* Atalhos de período oferecidos ao usuário. */
const ATALHOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' }
];

/* Acima disso o gráfico diário vira uma serra ilegível: mostramos só os
   dias que realmente tiveram checklists. */
const MAX_DIAS_SERIE = 120;

const MS_POR_DIA = 86400000;

const ID_ESTILO = 'estilo-relatorios';
const CSS = `
.rel-atalhos { display: flex; flex-wrap: wrap; gap: var(--esp-2); align-items: center; }
.rel-atalhos .btn[aria-pressed="true"] {
  background: var(--petroleo-600); color: #fff; border-color: var(--petroleo-600);
}

/* Gráfico de colunas — evolução diária */
.rel-grafico {
  display: flex; align-items: stretch; gap: 3px;
  height: 190px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--esp-1);
}
.rel-col {
  flex: 1 0 16px; min-width: 16px;
  display: flex; flex-direction: column; justify-content: flex-end;
}
.rel-col-trilha { flex: 1; display: flex; align-items: flex-end; }
.rel-col-barra {
  width: 100%;
  min-height: 3px;
  background: var(--petroleo-500);
  border-radius: var(--raio-sm) var(--raio-sm) 0 0;
}
.rel-col-barra.vazia { background: var(--borda-forte); }
.rel-col-rotulo {
  margin-top: var(--esp-1);
  height: 1.1rem;
  font-size: .62rem; line-height: 1.1rem;
  text-align: center; white-space: nowrap;
  color: var(--texto-fraco);
  font-variant-numeric: tabular-nums;
}
.rel-grafico-eixo {
  display: flex; justify-content: space-between; gap: var(--esp-3);
  margin-top: var(--esp-2);
  font-size: .78rem; color: var(--texto-fraco);
}

/* Ranking horizontal de não conformidades */
.rel-rank { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--esp-4); }
.rel-rank-topo {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--esp-2);
  margin-bottom: var(--esp-1);
}
.rel-rank-nome { font-weight: 650; font-size: .95rem; }
.rel-rank-valor {
  margin-left: auto; font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.rel-rank .barra { height: 12px; }
`;

function injetarEstilo() {
  if (document.getElementById(ID_ESTILO)) return;
  document.head.appendChild(elemento('style', { id: ID_ESTILO }, [CSS]));
}

/* ---------------------------------------------------------------- datas ---- */

/** Soma dias a uma data 'AAAA-MM-DD' usando UTC (imune a horário de verão). */
function somarDias(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Quantidade de dias entre duas datas 'AAAA-MM-DD' (fim − inicio). */
function distanciaEmDias(inicio, fim) {
  const [a1, m1, d1] = inicio.split('-').map(Number);
  const [a2, m2, d2] = fim.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_POR_DIA);
}

/** 'AAAA-MM-DD' → 'DD/MM' (rótulo curto do eixo). */
function diaMes(iso) {
  const casa = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return casa ? `${casa[3]}/${casa[2]}` : String(iso || '');
}

/* --------------------------------------------------------------- página ---- */

export default async function render(container) {
  injetarEstilo();

  const fim = hoje();
  const estado = { de: somarDias(fim, -29), ate: fim };

  let sequencia = 0;

  /* ------------------------------------------------------------------ topo */

  const btnExportar = elemento('button', {
    type: 'button',
    class: 'btn btn-secundario',
    onclick: exportarCsv
  }, ['⬇ Exportar CSV']);

  const topo = elemento('div', { class: 'pagina-topo' }, [
    elemento('div', {}, [
      elemento('h1', {}, ['Relatórios']),
      elemento('p', { class: 'pagina-sub', id: 'rel-sub' }, ['Indicadores consolidados do período.'])
    ]),
    elemento('div', { class: 'barra-acoes' }, [btnExportar])
  ]);
  const subtitulo = topo.querySelector('#rel-sub');

  /* --------------------------------------------------------------- filtros */

  const campoDe = elemento('input', { type: 'date', id: 'rel-de', value: estado.de, max: fim });
  const campoAte = elemento('input', { type: 'date', id: 'rel-ate', value: estado.ate, max: fim });

  const botoesAtalho = ATALHOS.map((atalho) => elemento('button', {
    type: 'button',
    class: 'btn btn-secundario btn-pequeno',
    'aria-pressed': 'false',
    dataset: { dias: String(atalho.dias) },
    onclick: () => aplicarAtalho(atalho.dias)
  }, [atalho.rotulo]));

  function marcarAtalhoAtivo() {
    // Só fica marcado quando o período corresponde exatamente ao atalho e
    // termina hoje — assim o usuário sabe que está vendo um recorte padrão.
    const dias = estado.ate === hoje() ? distanciaEmDias(estado.de, estado.ate) + 1 : -1;
    botoesAtalho.forEach((botao) => {
      botao.setAttribute('aria-pressed', String(Number(botao.dataset.dias) === dias));
    });
  }

  function aplicarAtalho(dias) {
    const ate = hoje();
    estado.ate = ate;
    estado.de = somarDias(ate, -(dias - 1));
    campoDe.value = estado.de;
    campoAte.value = estado.ate;
    carregar();
  }

  function aplicarPeriodo() {
    const de = campoDe.value;
    const ate = campoAte.value;

    if (!de || !ate) {
      toast('Informe as duas datas do período.', 'alerta');
      return;
    }
    if (de > ate) {
      toast('A data inicial não pode ser posterior à data final.', 'alerta');
      return;
    }

    estado.de = de;
    estado.ate = ate;
    carregar();
  }

  campoDe.addEventListener('change', aplicarPeriodo);
  campoAte.addEventListener('change', aplicarPeriodo);

  const filtros = elemento('form', {
    class: 'filtros',
    onsubmit: (ev) => { ev.preventDefault(); aplicarPeriodo(); }
  }, [
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'rel-de' }, ['De']),
      campoDe
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'rel-ate' }, ['Até']),
      campoAte
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { id: 'rel-atalhos-rotulo' }, ['Períodos rápidos']),
      elemento('div', {
        class: 'rel-atalhos',
        role: 'group',
        'aria-labelledby': 'rel-atalhos-rotulo'
      }, botoesAtalho)
    ])
  ]);

  /* ---------------------------------------------------------------- seções */

  const areaResumo = elemento('section', { 'aria-label': 'Resumo do período' });
  const areaEvolucao = elemento('section', { class: 'card', 'aria-label': 'Evolução diária' });
  const areaRanking = elemento('section', { class: 'card', 'aria-label': 'Ranking de não conformidades' });
  const areaVeiculos = elemento('section', { class: 'card', 'aria-label': 'Desempenho por veículo' });

  container.replaceChildren(topo, filtros, areaResumo, areaEvolucao, areaRanking, areaVeiculos);

  /* ------------------------------------------------------------ utilitários */

  function blocoErro(mensagem) {
    return elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
      elemento('h3', {}, ['Não foi possível carregar']),
      elemento('p', {}, [mensagem || 'Tente novamente em instantes.']),
      elemento('button', {
        type: 'button', class: 'btn btn-secundario', onclick: () => carregar()
      }, ['Tentar novamente'])
    ]);
  }

  function blocoVazio(icone, titulo, texto) {
    return elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, [icone]),
      elemento('h3', {}, [titulo]),
      elemento('p', {}, [texto])
    ]);
  }

  function cabecalhoCard(titulo, extra) {
    return elemento('div', { class: 'card-topo' }, [
      elemento('h2', {}, [titulo]),
      extra ? elemento('span', { class: 'texto-pequeno texto-fraco' }, [extra]) : null
    ]);
  }

  /* ----------------------------------------------------------- carregamento */

  async function carregar() {
    const atual = ++sequencia;
    marcarAtalhoAtivo();

    subtitulo.textContent =
      `Período de ${formatarData(estado.de)} a ${formatarData(estado.ate)}.`;

    spinner(areaResumo, 'Carregando indicadores…');
    spinner(areaEvolucao, 'Carregando evolução…');
    spinner(areaRanking, 'Carregando ranking…');
    spinner(areaVeiculos, 'Carregando veículos…');

    const periodo = { de: estado.de, ate: estado.ate };

    const [resumo, ranking, veiculos] = await Promise.allSettled([
      api.get('/relatorios/resumo', periodo),
      api.get('/relatorios/nao-conformidades', { ...periodo, limite: 10 }),
      api.get('/relatorios/veiculos', periodo)
    ]);

    if (atual !== sequencia) return; // período trocado durante a requisição

    // 401 já derrubou a sessão em api.js: não sobrepor a tela de login.
    const expirou = [resumo, ranking, veiculos]
      .some((r) => r.status === 'rejected' && r.reason?.codigo === 'NAO_AUTENTICADO');
    if (expirou) return;

    montarResumo(resumo);
    montarEvolucao(resumo);
    montarRanking(ranking);
    montarVeiculos(veiculos);
  }

  /* ---------------------------------------------------------------- resumo */

  function montarResumo(resultado) {
    if (resultado.status === 'rejected') {
      areaResumo.replaceChildren(blocoErro(resultado.reason?.mensagem));
      return;
    }

    const dados = resultado.value || {};
    const indicador = (rotulo, valor, modificador) => elemento('div', {
      class: `indicador${modificador ? ' ' + modificador : ''}`
    }, [
      elemento('div', { class: 'indicador-rotulo' }, [rotulo]),
      elemento('div', { class: 'indicador-valor' }, [formatarNumero(valor ?? 0)])
    ]);

    areaResumo.replaceChildren(
      elemento('div', { class: 'grade grade-4' }, [
        indicador('Checklists', dados.total_checklists),
        indicador('Aprovados', dados.aprovados, 'ok'),
        indicador('Com restrição', dados.restricoes, 'restricao'),
        indicador('Reprovados', dados.reprovados, 'reprovado'),
        indicador('Não conformidades', dados.total_nao_conformidades, 'reprovado')
      ])
    );
  }

  /* ------------------------------------------------------------- evolução */

  /**
   * Preenche com zero os dias sem checklist para o gráfico ter escala real de
   * calendário. Períodos muito longos ficam com os dias retornados apenas.
   */
  function serieDiaria(periodo, porDia) {
    const lista = Array.isArray(porDia) ? porDia : [];
    const mapa = new Map(lista.map((d) => [d.data, Number(d.total || 0)]));

    const de = periodo?.de || estado.de;
    const ate = periodo?.ate || estado.ate;
    const dias = distanciaEmDias(de, ate) + 1;

    if (!Number.isFinite(dias) || dias < 1 || dias > MAX_DIAS_SERIE) {
      return lista.map((d) => ({ data: d.data, total: Number(d.total || 0) }));
    }

    const serie = [];
    let cursor = de;
    for (let i = 0; i < dias; i += 1) {
      serie.push({ data: cursor, total: mapa.get(cursor) || 0 });
      cursor = somarDias(cursor, 1);
    }
    return serie;
  }

  function montarEvolucao(resultado) {
    const cabecalho = cabecalhoCard('Evolução diária', 'Checklists registrados por dia');

    if (resultado.status === 'rejected') {
      areaEvolucao.replaceChildren(cabecalho, blocoErro(resultado.reason?.mensagem));
      return;
    }

    const dados = resultado.value || {};
    const serie = serieDiaria(dados.periodo, dados.por_dia);

    if (!serie.length || serie.every((d) => d.total === 0)) {
      areaEvolucao.replaceChildren(cabecalho, blocoVazio(
        '📈',
        'Sem checklists no período',
        'Ajuste as datas ou registre uma nova inspeção para ver a evolução.'
      ));
      return;
    }

    const maximo = Math.max(...serie.map((d) => d.total), 1);
    // Com muitas colunas, rotular todas embaralha o eixo: espaçamos os rótulos.
    const passo = Math.max(1, Math.ceil(serie.length / 10));

    const colunas = serie.map((dia, indice) => {
      const altura = Math.round((dia.total / maximo) * 100);
      const descricao = `${formatarData(dia.data)}: ${formatarNumero(dia.total)} checklist(s)`;

      return elemento('div', {
        class: 'rel-col',
        role: 'listitem',
        'aria-label': descricao,
        title: descricao
      }, [
        elemento('div', { class: 'rel-col-trilha' }, [
          elemento('div', {
            class: `rel-col-barra${dia.total === 0 ? ' vazia' : ''}`,
            style: { height: `${dia.total === 0 ? 0 : Math.max(altura, 4)}%` },
            'aria-hidden': 'true'
          })
        ]),
        elemento('div', { class: 'rel-col-rotulo', 'aria-hidden': 'true' }, [
          indice % passo === 0 ? diaMes(dia.data) : ''
        ])
      ]);
    });

    const total = serie.reduce((soma, d) => soma + d.total, 0);
    const pico = serie.reduce((melhor, d) => (d.total > melhor.total ? d : melhor), serie[0]);

    areaEvolucao.replaceChildren(
      cabecalho,
      elemento('div', {
        class: 'rel-grafico',
        role: 'list',
        'aria-label': `Checklists por dia entre ${formatarData(estado.de)} e ${formatarData(estado.ate)}`
      }, colunas),
      elemento('div', { class: 'rel-grafico-eixo' }, [
        elemento('span', {}, [`Total: ${formatarNumero(total)}`]),
        elemento('span', {}, [`Pico: ${formatarNumero(pico.total)} em ${formatarData(pico.data)}`])
      ])
    );
  }

  /* -------------------------------------------------------------- ranking */

  function montarRanking(resultado) {
    const cabecalho = cabecalhoCard('Não conformidades por item', 'Os 10 itens que mais reprovam');

    if (resultado.status === 'rejected') {
      areaRanking.replaceChildren(cabecalho, blocoErro(resultado.reason?.mensagem));
      return;
    }

    const lista = Array.isArray(resultado.value) ? resultado.value : [];

    if (!lista.length) {
      areaRanking.replaceChildren(cabecalho, blocoVazio(
        '✅',
        'Nenhuma não conformidade',
        'Todos os itens inspecionados no período foram aprovados.'
      ));
      return;
    }

    const maximo = Math.max(...lista.map((i) => Number(i.total || 0)), 1);
    const soma = lista.reduce((acumulado, i) => acumulado + Number(i.total || 0), 0);

    const itens = lista.map((item) => {
      const total = Number(item.total || 0);
      const largura = Math.max(2, Math.round((total / maximo) * 100));
      const fatia = soma > 0 ? Math.round((total / soma) * 100) : 0;

      // Nome vem do banco: escapado antes de compor o rótulo acessível.
      const nome = item.nome || item.chave || 'Item';
      const descricao = `${nome}: ${formatarNumero(total)} ocorrência(s), ${fatia}% do total` +
        (item.critico ? ' — item crítico' : '');

      return elemento('li', {}, [
        elemento('div', { class: 'rel-rank-topo' }, [
          elemento('span', { class: 'rel-rank-nome' }, [nome]),
          item.critico ? elemento('span', { class: 'badge badge-critico' }, ['Crítico']) : null,
          elemento('span', { class: 'rel-rank-valor' }, [
            `${formatarNumero(total)} · ${fatia}%`
          ])
        ]),
        elemento('div', {
          class: `barra ${item.critico ? 'nc' : 'pen'}`,
          role: 'img',
          'aria-label': descricao
        }, [
          elemento('span', { style: { width: `${largura}%` } })
        ])
      ]);
    });

    areaRanking.replaceChildren(
      cabecalho,
      elemento('ul', { class: 'rel-rank' }, itens)
    );
  }

  /* ------------------------------------------------------------- veículos */

  function montarVeiculos(resultado) {
    const cabecalho = cabecalhoCard('Desempenho por veículo', 'Somente veículos com checklists no período');

    if (resultado.status === 'rejected') {
      areaVeiculos.replaceChildren(cabecalho, blocoErro(resultado.reason?.mensagem));
      return;
    }

    const lista = Array.isArray(resultado.value) ? resultado.value : [];

    if (!lista.length) {
      areaVeiculos.replaceChildren(cabecalho, blocoVazio(
        '🚛',
        'Nenhum veículo inspecionado',
        'Nenhum checklist foi registrado no período selecionado.'
      ));
      return;
    }

    const cabecalhoTabela = elemento('thead', {}, [
      elemento('tr', {}, [
        elemento('th', {}, ['Veículo']),
        elemento('th', { class: 'numero' }, ['Checklists']),
        elemento('th', { class: 'numero' }, ['Reprovados']),
        elemento('th', { class: 'numero' }, ['Não conformidades']),
        elemento('th', {}, ['Último checklist'])
      ])
    ]);

    const linhas = lista.map((veiculo) => {
      const reprovados = Number(veiculo.reprovados || 0);
      const nc = Number(veiculo.nc || 0);

      // Conteúdo do banco escapado antes de virar HTML.
      const identificacao = `<span class="placa">${escapar(veiculo.placa || '—')}</span>`;

      return elemento('tr', {}, [
        elemento('td', { 'data-rotulo': 'Veículo', html: identificacao }),
        elemento('td', { class: 'numero', 'data-rotulo': 'Checklists' }, [
          formatarNumero(veiculo.total)
        ]),
        elemento('td', { class: 'numero', 'data-rotulo': 'Reprovados' }, [
          reprovados > 0
            ? elemento('span', { class: 'badge badge-critico' }, [formatarNumero(reprovados)])
            : elemento('span', { class: 'texto-fraco' }, ['0'])
        ]),
        elemento('td', { class: 'numero', 'data-rotulo': 'Não conformidades' }, [
          nc > 0
            ? elemento('span', { class: 'badge badge-alerta' }, [formatarNumero(nc)])
            : elemento('span', { class: 'texto-fraco' }, ['0'])
        ]),
        elemento('td', { 'data-rotulo': 'Último checklist' }, [formatarData(veiculo.ultimo)])
      ]);
    });

    areaVeiculos.replaceChildren(
      cabecalho,
      elemento('div', { class: 'tabela-envolve' }, [
        elemento('table', { class: 'tabela' }, [
          cabecalhoTabela,
          elemento('tbody', {}, linhas)
        ])
      ])
    );
  }

  /* --------------------------------------------------------------- export */

  async function exportarCsv() {
    // O <a href> não carrega o header Authorization: baixamos via fetch
    // (api.js injeta o token) e geramos um blob local.
    btnExportar.disabled = true;
    const rotulo = btnExportar.textContent;
    btnExportar.textContent = 'Gerando…';

    try {
      const csv = await api.get('/exportar/csv', { de: estado.de, ate: estado.ate });

      if (!csv) {
        toast('Nenhum registro para exportar no período.', 'alerta');
        return;
      }

      // Response.text() descarta o BOM enviado pelo servidor; reintroduzimos
      // para o Excel pt-BR abrir os acentos corretamente.
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const endereco = URL.createObjectURL(blob);
      const link = elemento('a', {
        href: endereco,
        download: `relatorio-${estado.de}-a-${estado.ate}.csv`
      });
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(endereco);

      toast('Arquivo CSV gerado.', 'sucesso');
    } catch (erro) {
      if (erro?.codigo !== 'NAO_AUTENTICADO') {
        toast(erro?.mensagem || 'Não foi possível exportar o CSV.', 'erro');
      }
    } finally {
      btnExportar.disabled = false;
      btnExportar.textContent = rotulo;
    }
  }

  await carregar();
}
