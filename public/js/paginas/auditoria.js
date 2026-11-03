/**
 * paginas/auditoria.js — trilha de auditoria (tela exclusiva de administrador).
 * Só leitura: a API não oferece meio de alterar nem apagar registro nenhum.
 * A tabela vira cartões no celular via data-rotulo, como no histórico.
 */

import { api } from '../api.js';
import {
  elemento, escapar, formatarDataHora, formatarNumero, debounce, spinner
} from '../util.js';

/* As ações foram gravadas com grafias diferentes ao longo do tempo
   ('login-falha', 'adicionar_foto', 'EXPORTAR'). Traduzimos na exibição em vez
   de reescrever o banco: registro de auditoria não se corrige depois do fato. */
const ROTULO_ACAO = {
  login: 'Entrou no sistema',
  'login-falha': 'Tentativa de login falhou',
  'login-bloqueado': 'Login bloqueado por excesso de tentativas',
  'alterar-senha': 'Trocou a senha',
  criar: 'Criou',
  atualizar: 'Editou',
  desativar: 'Desativou',
  remover: 'Excluiu',
  adicionar_foto: 'Anexou foto',
  remover_foto: 'Excluiu foto',
  EXPORTAR: 'Exportou CSV'
};

/* Ações que merecem destaque numa varredura rápida da tela. */
const ACAO_CRITICA = new Set(['login-falha', 'login-bloqueado', 'remover', 'remover_foto']);
const ACAO_ATENCAO = new Set(['desativar', 'alterar-senha']);

const ROTULO_ENTIDADE = {
  usuario: 'Usuário',
  veiculo: 'Veículo',
  checklist: 'Checklist',
  checklists: 'Checklists',
  foto: 'Foto'
};

/* Rótulos amigáveis para as chaves que aparecem no detalhe. */
const ROTULO_CAMPO = {
  email: 'e-mail',
  perfil: 'perfil',
  placa: 'placa',
  falhas: 'tentativas',
  status: 'situação',
  aprovacao: 'decisão',
  veiculo_id: 'veículo',
  checklist_id: 'checklist',
  item_chave: 'item',
  total_fotos: 'fotos',
  senhaAlterada: 'senha alterada',
  campos: 'campos',
  linhas: 'linhas',
  de: 'de',
  ate: 'até'
};

const ID_ESTILO = 'estilo-auditoria';
const CSS = `
.aud-detalhe { display: flex; flex-wrap: wrap; gap: 2px var(--esp-2); max-width: 42ch; }
.aud-par { font-size: .82rem; white-space: nowrap; }
.aud-par b { font-weight: 650; }
.aud-ip { font-variant-numeric: tabular-nums; font-size: .82rem; }
.aud-anonimo { font-style: italic; }
`;

function injetarEstilo() {
  if (document.getElementById(ID_ESTILO)) return;
  document.head.appendChild(elemento('style', { id: ID_ESTILO }, [CSS]));
}

function rotuloAcao(acao) {
  return ROTULO_ACAO[acao] || acao || '—';
}

function chipAcao(acao) {
  const classe = ACAO_CRITICA.has(acao)
    ? 'chip chip-reprovado'
    : ACAO_ATENCAO.has(acao)
      ? 'chip chip-restricao'
      : 'chip chip-info';
  return elemento('span', { class: classe }, [rotuloAcao(acao)]);
}

/** "Checklist nº 4" com link quando o objeto tem tela própria. */
function celulaObjeto(item) {
  const nome = ROTULO_ENTIDADE[item.entidade] || item.entidade || '—';
  if (item.entidade_id === null || item.entidade_id === undefined) {
    return elemento('span', {}, [nome]);
  }

  const texto = `${nome} nº ${item.entidade_id}`;
  // Só o checklist tem rota de detalhe; veículo e usuário abrem listagens,
  // onde o link levaria a lugar nenhum de útil.
  if (item.entidade === 'checklist') {
    return elemento('a', { href: `#/historico/${item.entidade_id}` }, [texto]);
  }
  return elemento('span', {}, [texto]);
}

/** Achata o objeto do detalhe em pares legíveis, sem virar parede de JSON. */
function celulaDetalhe(detalhe) {
  if (detalhe === null || detalhe === undefined) {
    return elemento('span', { class: 'texto-fraco' }, ['—']);
  }
  if (typeof detalhe !== 'object') {
    return elemento('span', { class: 'texto-pequeno' }, [String(detalhe)]);
  }

  const pares = Object.entries(detalhe)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
    .map(([chave, valor]) => {
      const rotulo = ROTULO_CAMPO[chave] || chave;
      const texto = Array.isArray(valor) ? valor.join(', ') : String(valor);
      // Conteúdo vindo do banco: escapado antes de virar HTML.
      return elemento('span', {
        class: 'aud-par',
        html: `<b>${escapar(rotulo)}:</b> ${escapar(texto)}`
      });
    });

  if (!pares.length) return elemento('span', { class: 'texto-fraco' }, ['—']);
  return elemento('div', { class: 'aud-detalhe' }, pares);
}

export default async function render(container) {
  injetarEstilo();

  const estado = {
    busca: '', acao: '', entidade: '', usuario_id: '', de: '', ate: '',
    pagina: 1, limite: 50, total: 0, paginas: 1
  };

  // Descarta respostas de buscas antigas que chegarem fora de ordem.
  let sequencia = 0;

  /* ---------------------------------------------------------------- topo */

  const topo = elemento('div', { class: 'pagina-topo' }, [
    elemento('div', {}, [
      elemento('h1', {}, ['Auditoria']),
      elemento('p', { class: 'pagina-sub' }, [
        'Quem fez o quê, quando e de qual endereço. Registro somente leitura.'
      ])
    ])
  ]);

  /* ------------------------------------------------------------- filtros */

  const campoBusca = elemento('input', {
    type: 'search', id: 'aud-busca', autocomplete: 'off',
    placeholder: 'Nome, e-mail, placa, IP…'
  });

  const campoAcao = elemento('select', { id: 'aud-acao' }, [
    elemento('option', { value: '' }, ['Todas as ações'])
  ]);

  const campoEntidade = elemento('select', { id: 'aud-entidade' }, [
    elemento('option', { value: '' }, ['Todos os objetos'])
  ]);

  const campoUsuario = elemento('select', { id: 'aud-usuario' }, [
    elemento('option', { value: '' }, ['Todos os usuários'])
  ]);

  const campoDe = elemento('input', { type: 'date', id: 'aud-de' });
  const campoAte = elemento('input', { type: 'date', id: 'aud-ate' });

  const btnLimpar = elemento('button', {
    type: 'button', class: 'btn btn-fantasma',
    onclick: () => {
      campoBusca.value = '';
      campoAcao.value = '';
      campoEntidade.value = '';
      campoUsuario.value = '';
      campoDe.value = '';
      campoAte.value = '';
      aplicarFiltros();
    }
  }, ['Limpar filtros']);

  function aplicarFiltros() {
    estado.busca = campoBusca.value.trim();
    estado.acao = campoAcao.value;
    estado.entidade = campoEntidade.value;
    estado.usuario_id = campoUsuario.value;
    estado.de = campoDe.value;
    estado.ate = campoAte.value;
    estado.pagina = 1; // filtro novo sempre recomeça na primeira página
    carregar();
  }

  campoBusca.addEventListener('input', debounce(aplicarFiltros, 400));
  [campoAcao, campoEntidade, campoUsuario, campoDe, campoAte]
    .forEach((campo) => campo.addEventListener('change', aplicarFiltros));

  const filtros = elemento('form', {
    class: 'filtros',
    onsubmit: (ev) => { ev.preventDefault(); aplicarFiltros(); }
  }, [
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'aud-busca' }, ['Buscar']), campoBusca
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'aud-acao' }, ['Ação']), campoAcao
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'aud-entidade' }, ['Objeto']), campoEntidade
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'aud-usuario' }, ['Usuário']), campoUsuario
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'aud-de' }, ['De']), campoDe
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'aud-ate' }, ['Até']), campoAte
    ]),
    elemento('div', { class: 'campo' }, [btnLimpar])
  ]);

  const area = elemento('div', {});
  const areaPaginacao = elemento('div', {});

  container.replaceChildren(topo, filtros, area, areaPaginacao);

  /* ------------------------------------------------- opções dos filtros */

  /** Preenche os selects com o que existe de fato na trilha. */
  async function carregarOpcoes() {
    try {
      const opcoes = await api.get('/auditoria/opcoes');

      for (const item of opcoes?.acoes || []) {
        campoAcao.appendChild(elemento('option', { value: item.valor }, [
          `${rotuloAcao(item.valor)} (${formatarNumero(item.total)})`
        ]));
      }
      for (const item of opcoes?.entidades || []) {
        campoEntidade.appendChild(elemento('option', { value: item.valor }, [
          `${ROTULO_ENTIDADE[item.valor] || item.valor} (${formatarNumero(item.total)})`
        ]));
      }
      for (const item of opcoes?.usuarios || []) {
        campoUsuario.appendChild(elemento('option', { value: String(item.id) }, [
          `${item.nome} (${formatarNumero(item.total)})`
        ]));
      }
    } catch (erro) {
      // Filtros são conveniência: sem eles a listagem ainda funciona.
      if (erro?.codigo !== 'NAO_AUTENTICADO') {
        console.warn('Não foi possível carregar os filtros da auditoria:', erro);
      }
    }
  }

  /* --------------------------------------------------------------- dados */

  async function carregar() {
    const atual = ++sequencia;
    spinner(area, 'Carregando registros…');
    areaPaginacao.replaceChildren();

    try {
      const resposta = await api.get('/auditoria', {
        busca: estado.busca,
        acao: estado.acao,
        entidade: estado.entidade,
        usuario_id: estado.usuario_id,
        de: estado.de,
        ate: estado.ate,
        pagina: estado.pagina,
        limite: estado.limite
      });
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
    return Boolean(
      estado.busca || estado.acao || estado.entidade ||
      estado.usuario_id || estado.de || estado.ate
    );
  }

  function estadoVazio() {
    return elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['🔎']),
      elemento('h3', {}, [
        temFiltro() ? 'Nenhum registro encontrado' : 'Nenhum registro de auditoria'
      ]),
      elemento('p', {}, [
        temFiltro()
          ? 'Nenhuma ação corresponde aos filtros aplicados. Amplie o período ou limpe a busca.'
          : 'Assim que alguém entrar no sistema ou alterar um cadastro, o registro aparecerá aqui.'
      ]),
      temFiltro()
        ? elemento('button', {
            type: 'button', class: 'btn btn-secundario', onclick: () => btnLimpar.click()
          }, ['Limpar filtros'])
        : null
    ]);
  }

  function blocoErro(erro) {
    return elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
      elemento('h3', {}, ['Não foi possível carregar']),
      elemento('p', {}, [erro?.mensagem || 'Tente novamente em instantes.']),
      elemento('button', {
        type: 'button', class: 'btn btn-secundario', onclick: carregar
      }, ['Tentar novamente'])
    ]);
  }

  /* -------------------------------------------------------------- tabela */

  function montarTabela(lista) {
    const cabecalho = elemento('thead', {}, [
      elemento('tr', {}, [
        elemento('th', {}, ['Data / hora']),
        elemento('th', {}, ['Usuário']),
        elemento('th', {}, ['Ação']),
        elemento('th', {}, ['Objeto']),
        elemento('th', {}, ['Detalhe']),
        elemento('th', {}, ['IP'])
      ])
    ]);

    return elemento('div', { class: 'tabela-envolve' }, [
      elemento('table', { class: 'tabela' }, [
        cabecalho,
        elemento('tbody', {}, lista.map(linha))
      ])
    ]);
  }

  function linha(item) {
    const usuario = item.usuario
      ? elemento('div', {}, [
          elemento('div', {}, [item.usuario.nome || '—']),
          elemento('div', { class: 'texto-pequeno texto-fraco' }, [item.usuario.email || ''])
        ])
      // Sem usuário: login que falhou antes de autenticar, ou conta excluída.
      : elemento('span', { class: 'texto-fraco aud-anonimo' }, ['não identificado']);

    return elemento('tr', {}, [
      elemento('td', { 'data-rotulo': 'Data / hora' }, [formatarDataHora(item.criado_em)]),
      elemento('td', { 'data-rotulo': 'Usuário' }, [usuario]),
      elemento('td', { 'data-rotulo': 'Ação' }, [chipAcao(item.acao)]),
      elemento('td', { 'data-rotulo': 'Objeto' }, [celulaObjeto(item)]),
      elemento('td', { 'data-rotulo': 'Detalhe' }, [celulaDetalhe(item.detalhe)]),
      elemento('td', { 'data-rotulo': 'IP' }, [
        elemento('span', { class: 'aud-ip texto-fraco' }, [item.ip || '—'])
      ])
    ]);
  }

  /* ----------------------------------------------------------- paginação */

  function montarPaginacao() {
    const primeiro = (estado.pagina - 1) * estado.limite + 1;
    const ultimo = Math.min(estado.pagina * estado.limite, estado.total);

    return elemento('div', { class: 'paginacao' }, [
      elemento('button', {
        type: 'button', class: 'btn btn-secundario btn-pequeno',
        disabled: estado.pagina <= 1,
        onclick: () => irPara(estado.pagina - 1)
      }, ['‹ Anterior']),
      elemento('span', { class: 'paginacao-info' }, [
        `${formatarNumero(primeiro)}–${formatarNumero(ultimo)} de ${formatarNumero(estado.total)} registro(s) · página ${estado.pagina} de ${estado.paginas}`
      ]),
      elemento('button', {
        type: 'button', class: 'btn btn-secundario btn-pequeno',
        disabled: estado.pagina >= estado.paginas,
        onclick: () => irPara(estado.pagina + 1)
      }, ['Próxima ›'])
    ]);
  }

  function irPara(pagina) {
    if (pagina < 1 || pagina > estado.paginas) return;
    estado.pagina = pagina;
    carregar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  await Promise.all([carregarOpcoes(), carregar()]);
}
