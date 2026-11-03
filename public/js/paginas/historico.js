/**
 * historico.js — lista paginada de checklists com filtros, exportação CSV
 * e exclusão (admin). A tabela vira cartões no celular via data-rotulo.
 */

import { api } from '../api.js';
import {
  elemento, escapar, formatarData, formatarNumero, debounce,
  spinner, toast, confirmar, ROTULO_STATUS
} from '../util.js';

// AAA9999 (antiga) e AAA9A99 (Mercosul) num único padrão:
// a 5ª posição é o que diferencia — dígito na antiga, letra na Mercosul.
const PLACA_VALIDA = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

/** Opções do filtro de situação (o valor vazio significa "todas"). */
const SITUACOES = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'APROVADO', rotulo: 'Aprovado' },
  { valor: 'RESTRICAO', rotulo: 'Aprovado com restrição' },
  { valor: 'REPROVADO', rotulo: 'Reprovado' }
];

/** Decisão final do responsável (registros antigos vêm sem ela). */
const APROVACAO = {
  APROVADO: { rotulo: 'Aprovado', chip: 'chip-aprovado' },
  REPROVADO: { rotulo: 'Não aprovado', chip: 'chip-reprovado' }
};

/** Selo colorido reaproveitando os chips do design system. */
function chipSituacao(status) {
  const chave = String(status || '').toLowerCase();
  return elemento('span', { class: `chip chip-${chave || 'na'}` }, [
    ROTULO_STATUS[status] || status || '—'
  ]);
}

function chipAprovacao(aprovacao) {
  const info = APROVACAO[aprovacao];
  if (!info) return elemento('span', { class: 'texto-fraco texto-pequeno' }, ['—']);
  return elemento('span', { class: `chip ${info.chip}` }, [info.rotulo]);
}

export default async function render(container, params) {
  const usuario = api.usuarioAtual();
  const ehAdmin = usuario?.perfil === 'admin';

  // Estado da tela vive aqui: filtros e página corrente.
  const estado = {
    busca: '',
    de: '',
    ate: '',
    situacao: '',
    pagina: 1,
    limite: 20,
    total: 0,
    paginas: 1
  };

  // Descarta respostas de buscas antigas que chegarem fora de ordem.
  let sequencia = 0;

  /* ---------------------------------------------------------------- topo */

  const btnExportar = elemento('button', {
    type: 'button',
    class: 'btn btn-secundario',
    onclick: exportarCsv
  }, ['⬇ Exportar CSV']);

  const topo = elemento('div', { class: 'pagina-topo' }, [
    elemento('div', {}, [
      elemento('h1', {}, ['Histórico de checklists']),
      elemento('p', { class: 'pagina-sub' }, ['Consulte, filtre e exporte as inspeções realizadas.'])
    ]),
    elemento('div', { class: 'barra-acoes' }, [
      btnExportar,
      elemento('a', { class: 'btn btn-primario', href: '#/novo' }, ['+ Novo checklist'])
    ])
  ]);

  /* ------------------------------------------------------------- filtros */

  const campoBusca = elemento('input', {
    type: 'search',
    id: 'filtro-busca',
    placeholder: 'Placa ou modelo',
    autocomplete: 'off'
  });

  const campoDe = elemento('input', { type: 'date', id: 'filtro-de' });
  const campoAte = elemento('input', { type: 'date', id: 'filtro-ate' });

  const campoSituacao = elemento('select', { id: 'filtro-situacao' },
    SITUACOES.map((s) => elemento('option', { value: s.valor }, [s.rotulo]))
  );

  const btnLimpar = elemento('button', {
    type: 'button',
    class: 'btn btn-fantasma',
    onclick: () => {
      campoBusca.value = '';
      campoDe.value = '';
      campoAte.value = '';
      campoSituacao.value = '';
      aplicarFiltros();
    }
  }, ['Limpar filtros']);

  function aplicarFiltros() {
    estado.busca = campoBusca.value.trim();
    estado.de = campoDe.value;
    estado.ate = campoAte.value;
    estado.situacao = campoSituacao.value;
    estado.pagina = 1; // filtro novo sempre recomeça na primeira página
    carregar();
  }

  // Digitar não deve disparar uma requisição por tecla.
  campoBusca.addEventListener('input', debounce(aplicarFiltros, 400));
  campoDe.addEventListener('change', aplicarFiltros);
  campoAte.addEventListener('change', aplicarFiltros);
  campoSituacao.addEventListener('change', aplicarFiltros);

  const filtros = elemento('form', {
    class: 'filtros',
    onsubmit: (ev) => { ev.preventDefault(); aplicarFiltros(); }
  }, [
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'filtro-busca' }, ['Buscar veículo']),
      campoBusca
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'filtro-de' }, ['De']),
      campoDe
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'filtro-ate' }, ['Até']),
      campoAte
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'filtro-situacao' }, ['Situação']),
      campoSituacao
    ]),
    elemento('div', { class: 'campo' }, [btnLimpar])
  ]);

  /* -------------------------------------------------------- áreas de saída */

  const area = elemento('div', {});
  const areaPaginacao = elemento('div', {});

  container.replaceChildren(topo, filtros, area, areaPaginacao);

  /* --------------------------------------------------------------- dados */

  function parametros() {
    return {
      busca: estado.busca,
      de: estado.de,
      ate: estado.ate,
      status: estado.situacao,
      pagina: estado.pagina,
      limite: estado.limite
    };
  }

  async function carregar() {
    const atual = ++sequencia;
    spinner(area, 'Carregando checklists…');
    areaPaginacao.replaceChildren();

    try {
      const resposta = await api.get('/checklists', parametros());
      if (atual !== sequencia) return;

      const lista = resposta?.dados || [];
      const pag = resposta?.paginacao || { pagina: 1, total: lista.length, paginas: 1 };

      estado.total = pag.total || 0;
      estado.paginas = pag.paginas || 1;
      estado.pagina = pag.pagina || 1;

      if (!lista.length) {
        area.replaceChildren(estadoVazio());
        return;
      }

      area.replaceChildren(montarTabela(lista));
      areaPaginacao.replaceChildren(montarPaginacao());
    } catch (erro) {
      if (atual !== sequencia) return;
      if (erro?.codigo === 'NAO_AUTENTICADO') return; // app.js já trata a sessão
      area.replaceChildren(blocoErro(erro));
    }
  }

  function temFiltro() {
    return Boolean(estado.busca || estado.de || estado.ate || estado.situacao);
  }

  function estadoVazio() {
    return elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['🗒️']),
      elemento('h3', {}, [temFiltro() ? 'Nenhum checklist encontrado' : 'Nenhum checklist registrado']),
      elemento('p', {}, [
        temFiltro()
          ? 'Nenhum registro corresponde aos filtros aplicados. Ajuste o período ou a busca.'
          : 'Assim que a primeira inspeção for lançada, ela aparecerá aqui.'
      ]),
      temFiltro()
        ? elemento('button', {
            type: 'button',
            class: 'btn btn-secundario',
            onclick: () => btnLimpar.click()
          }, ['Limpar filtros'])
        : elemento('a', { class: 'btn btn-primario', href: '#/novo' }, ['Registrar checklist'])
    ]);
  }

  function blocoErro(erro) {
    return elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
      elemento('h3', {}, ['Não foi possível carregar o histórico']),
      elemento('p', {}, [erro?.mensagem || 'Tente novamente em instantes.']),
      elemento('button', {
        type: 'button',
        class: 'btn btn-secundario',
        onclick: () => carregar()
      }, ['Tentar novamente'])
    ]);
  }

  /* -------------------------------------------------------------- tabela */

  function montarTabela(lista) {
    const cabecalho = elemento('thead', {}, [
      elemento('tr', {}, [
        elemento('th', {}, ['Data / hora']),
        elemento('th', {}, ['Veículo']),
        elemento('th', { class: 'numero' }, ['KM']),
        elemento('th', {}, ['Responsável']),
        elemento('th', {}, ['Decisão']),
        elemento('th', {}, ['Situação']),
        elemento('th', { class: 'numero' }, ['NC']),
        elemento('th', { class: 'numero' }, ['Fotos']),
        elemento('th', { class: 'acoes' }, ['Ações'])
      ])
    ]);

    const corpo = elemento('tbody', {}, lista.map(linha));

    return elemento('div', { class: 'tabela-envolve' }, [
      elemento('table', { class: 'tabela' }, [cabecalho, corpo])
    ]);
  }

  function linha(item) {
    const placa = item.veiculo?.placa || '—';
    const modelo = item.veiculo?.modelo;

    // Conteúdo do banco escapado antes de virar HTML.
    const veiculoHtml = `<span class="placa">${escapar(placa)}</span>` +
      (modelo ? `<div class="texto-pequeno texto-fraco">${escapar(modelo)}</div>` : '');

    const nc = Number(item.resumo?.nc || 0);
    const fotos = Number(item.total_fotos || 0);

    const acoes = [
      elemento('a', {
        class: 'btn btn-pequeno btn-secundario',
        href: `#/historico/${item.id}`
      }, ['Ver'])
    ];

    if (ehAdmin) {
      acoes.push(elemento('button', {
        type: 'button',
        class: 'btn btn-pequeno btn-fantasma',
        title: 'Excluir checklist',
        onclick: () => excluir(item)
      }, ['Excluir']));
    }

    return elemento('tr', {}, [
      elemento('td', { 'data-rotulo': 'Data / hora' }, [
        elemento('div', {}, [formatarData(item.data)]),
        elemento('div', { class: 'texto-pequeno texto-fraco' }, [item.hora || '—'])
      ]),
      elemento('td', { 'data-rotulo': 'Veículo', html: veiculoHtml }),
      elemento('td', { class: 'numero', 'data-rotulo': 'KM' }, [formatarNumero(item.km)]),
      elemento('td', { 'data-rotulo': 'Responsável' }, [item.responsavel?.nome || '—']),
      elemento('td', { 'data-rotulo': 'Decisão' }, [chipAprovacao(item.aprovacao)]),
      elemento('td', { 'data-rotulo': 'Situação' }, [chipSituacao(item.status)]),
      elemento('td', { class: 'numero', 'data-rotulo': 'Não conformidades' }, [
        nc > 0
          ? elemento('span', { class: 'badge badge-critico' }, [String(nc)])
          : elemento('span', { class: 'texto-fraco' }, ['0'])
      ]),
      elemento('td', { class: 'numero', 'data-rotulo': 'Fotos' }, [
        elemento('span', {
          class: fotos ? '' : 'texto-fraco',
          title: `${fotos} foto(s)`
        }, [`📷 ${fotos}`])
      ]),
      elemento('td', { class: 'acoes', 'data-rotulo': 'Ações' }, [
        elemento('div', { class: 'barra-acoes direita' }, acoes)
      ])
    ]);
  }

  /* ---------------------------------------------------------- paginação */

  function montarPaginacao() {
    const primeiro = (estado.pagina - 1) * estado.limite + 1;
    const ultimo = Math.min(estado.pagina * estado.limite, estado.total);

    const anterior = elemento('button', {
      type: 'button',
      class: 'btn btn-secundario btn-pequeno',
      disabled: estado.pagina <= 1,
      onclick: () => irPara(estado.pagina - 1)
    }, ['‹ Anterior']);

    const proxima = elemento('button', {
      type: 'button',
      class: 'btn btn-secundario btn-pequeno',
      disabled: estado.pagina >= estado.paginas,
      onclick: () => irPara(estado.pagina + 1)
    }, ['Próxima ›']);

    return elemento('div', { class: 'paginacao' }, [
      anterior,
      elemento('span', { class: 'paginacao-info' }, [
        `${formatarNumero(primeiro)}–${formatarNumero(ultimo)} de ${formatarNumero(estado.total)} registro(s) · página ${estado.pagina} de ${estado.paginas}`
      ]),
      proxima
    ]);
  }

  function irPara(pagina) {
    if (pagina < 1 || pagina > estado.paginas) return;
    estado.pagina = pagina;
    carregar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------- exclusão */

  async function excluir(item) {
    const placa = item.veiculo?.placa || 'veículo';
    const confirmado = await confirmar(
      `Excluir o checklist de ${placa} do dia ${formatarData(item.data)}? Os itens e as fotos também serão removidos e a ação não pode ser desfeita.`,
      { titulo: 'Excluir checklist', textoConfirmar: 'Excluir', perigo: true }
    );
    if (!confirmado) return;

    try {
      await api.del(`/checklists/${item.id}`);
      toast('Checklist excluído.', 'sucesso');

      // Se era o único registro da última página, recua uma página.
      const restantes = estado.total - 1;
      const ultimaPagina = Math.max(1, Math.ceil(restantes / estado.limite));
      if (estado.pagina > ultimaPagina) estado.pagina = ultimaPagina;

      carregar();
    } catch (erro) {
      toast(erro?.mensagem || 'Não foi possível excluir o checklist.', 'erro');
    }
  }

  /* -------------------------------------------------------------- export */

  async function exportarCsv() {
    // Não dá para enviar o header Authorization num <a href>: baixamos por
    // fetch (via api.js, que já injeta o token) e criamos um blob local.
    btnExportar.disabled = true;
    const rotulo = btnExportar.textContent;
    btnExportar.textContent = 'Gerando…';

    try {
      // A busca é livre ("Placa ou modelo"), mas /exportar/csv só
      // aceita placa completa: só repassamos quando o texto for uma placa.
      const candidata = estado.busca.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const placa = PLACA_VALIDA.test(candidata) ? candidata : '';

      const csv = await api.get('/exportar/csv', {
        de: estado.de,
        ate: estado.ate,
        placa
      });

      if (!csv) {
        toast('Nenhum registro para exportar.', 'alerta');
        return;
      }

      // Response.text() descarta o BOM enviado pelo servidor; reintroduzimos
      // para o Excel pt-BR abrir os acentos corretamente.
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const endereco = URL.createObjectURL(blob);
      const link = elemento('a', {
        href: endereco,
        download: `checklists-${new Date().toISOString().slice(0, 10)}.csv`
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
