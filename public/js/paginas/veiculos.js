/**
 * paginas/veiculos.js — cadastro da frota.
 * Administrador gerencia (criar, editar, desativar/reativar);
 * operador enxerga a mesma lista, porém somente leitura.
 */

import { api } from '../api.js';
import {
  elemento,
  escapar,
  formatarData,
  formatarNumero,
  debounce,
  spinner,
  toast,
  abrirModal,
  fecharModal,
  confirmar
} from '../util.js';

const LIMITE = 20;

// AAA9999 (antiga) e AAA9A99 (Mercosul) num único padrão:
// a 5ª posição é o que diferencia — dígito na antiga, letra na Mercosul.
const PLACA_VALIDA = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

const TIPOS_CARROCERIA = [
  'Baú',
  'Baú frigorífico',
  'Sider',
  'Graneleiro',
  'Carga seca',
  'Caçamba',
  'Tanque',
  'Prancha',
  'Canavieiro',
  'Porta-contêiner',
  'Cavalo mecânico'
];

/* Único estilo próprio da tela: destacar visualmente a linha desativada.
   Injetado uma vez para não repetir a cada renderização. */
function garantirEstilo() {
  if (document.getElementById('estilo-veiculos')) return;
  document.head.appendChild(
    elemento('style', { id: 'estilo-veiculos' }, [
      '.linha-inativa td { opacity: .62; }',
      '.veiculo-titulo { display: flex; flex-direction: column; gap: 2px; }'
    ])
  );
}

/* --------------------------------------------------------------------------
   Campos de formulário
   -------------------------------------------------------------------------- */

/**
 * Cria um campo já com rótulo, dica e área de erro.
 * Devolve o wrapper e utilitários para o formulário destacar problemas.
 */
function criarCampo({
  nome,
  rotulo,
  tipo = 'text',
  valor = '',
  dica = '',
  obrigatorio = false,
  cheia = false,
  atributos = {}
}) {
  const id = `veiculo-${nome}`;

  const entrada =
    tipo === 'textarea'
      ? elemento('textarea', { id, name: nome, rows: 3, ...atributos })
      : elemento('input', { id, name: nome, type: tipo, ...atributos });

  entrada.value = valor === null || valor === undefined ? '' : String(valor);
  if (obrigatorio) entrada.required = true;

  const erro = elemento('p', { class: 'campo-erro', hidden: true });

  const el = elemento('div', { class: `campo${cheia ? ' col-cheia' : ''}` }, [
    elemento('label', { for: id }, [rotulo]),
    entrada,
    dica ? elemento('span', { class: 'campo-dica' }, [dica]) : null,
    erro
  ]);

  return {
    el,
    entrada,
    get valor() {
      return entrada.value.trim();
    },
    marcarErro(mensagem) {
      el.classList.add('invalido');
      erro.textContent = mensagem;
      erro.hidden = false;
    },
    limpar() {
      el.classList.remove('invalido');
      erro.textContent = '';
      erro.hidden = true;
    }
  };
}

/** Checkbox no padrão da UI (alvo de toque grande). */
function criarCaixa({ nome, rotulo, marcado = false }) {
  const id = `veiculo-${nome}`;
  const entrada = elemento('input', { id, name: nome, type: 'checkbox' });
  entrada.checked = Boolean(marcado);

  const el = elemento('div', { class: 'campo col-cheia' }, [
    elemento('label', { class: 'caixa-marcar', for: id }, [entrada, rotulo])
  ]);

  return { el, entrada, get valor() { return entrada.checked; } };
}

/* --------------------------------------------------------------------------
   Página
   -------------------------------------------------------------------------- */

export default async function render(container, params) {
  garantirEstilo();

  const usuario = api.usuarioAtual();
  const admin = usuario?.perfil === 'admin';

  // Estado local à renderização: navegar para outra tela e voltar recomeça limpo.
  const estado = {
    busca: '',
    situacao: '1', // '1' ativos · '0' inativos · '' todos
    pagina: 1,
    total: 0,
    paginas: 1,
    requisicao: 0
  };

  /* ---------- Estrutura fixa da página ---------- */

  const botaoNovo = elemento(
    'button',
    { type: 'button', class: 'btn btn-primario', onclick: () => abrirFormulario(null) },
    ['+ Novo veículo']
  );

  const topo = elemento('div', { class: 'pagina-topo' }, [
    elemento('div', {}, [
      elemento('h1', {}, ['Veículos']),
      elemento('p', { class: 'pagina-sub' }, [
        admin
          ? 'Cadastre e mantenha os dados da frota.'
          : 'Consulta da frota cadastrada.'
      ])
    ]),
    admin ? botaoNovo : null
  ]);

  const entradaBusca = elemento('input', {
    id: 'veiculos-busca',
    type: 'search',
    placeholder: 'Placa, marca ou modelo',
    autocomplete: 'off'
  });

  const seletorSituacao = elemento('select', { id: 'veiculos-situacao' }, [
    elemento('option', { value: '1' }, ['Somente ativos']),
    elemento('option', { value: '0' }, ['Somente inativos']),
    elemento('option', { value: '' }, ['Todos'])
  ]);
  seletorSituacao.value = estado.situacao;

  const filtros = elemento('form', { class: 'filtros', autocomplete: 'off' }, [
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'veiculos-busca' }, ['Buscar']),
      entradaBusca
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'veiculos-situacao' }, ['Situação']),
      seletorSituacao
    ])
  ]);
  // Enter no campo de busca não deve recarregar a página.
  filtros.addEventListener('submit', (ev) => ev.preventDefault());

  const alvo = elemento('div', { id: 'veiculos-lista' });
  const rodapePaginacao = elemento('div', { class: 'paginacao', hidden: true });

  container.replaceChildren(topo, filtros, alvo, rodapePaginacao);

  entradaBusca.addEventListener(
    'input',
    debounce(() => {
      estado.busca = entradaBusca.value.trim();
      estado.pagina = 1;
      carregar();
    }, 350)
  );

  seletorSituacao.addEventListener('change', () => {
    estado.situacao = seletorSituacao.value;
    estado.pagina = 1;
    carregar();
  });

  /* ---------- Carregamento ---------- */

  async function carregar() {
    const sequencia = ++estado.requisicao;
    spinner(alvo, 'Carregando veículos…');
    rodapePaginacao.hidden = true;

    try {
      const resposta = await api.get('/veiculos', {
        busca: estado.busca,
        ativo: estado.situacao,
        pagina: estado.pagina,
        limite: LIMITE
      });

      if (sequencia !== estado.requisicao) return; // filtro mudou durante a espera

      // A rota devolve { dados, paginacao }; toleramos array puro por segurança.
      const lista = Array.isArray(resposta) ? resposta : resposta?.dados ?? [];
      const info = Array.isArray(resposta) ? null : resposta?.paginacao;

      estado.total = info ? Number(info.total ?? lista.length) : lista.length;
      estado.paginas = info ? Math.max(1, Number(info.paginas ?? 1)) : 1;

      mostrarLista(lista);
      mostrarPaginacao();
    } catch (erro) {
      if (sequencia !== estado.requisicao) return;
      if (erro?.codigo === 'NAO_AUTENTICADO') return; // a sessão já foi encerrada
      mostrarErro(erro);
    }
  }

  function mostrarErro(erro) {
    alvo.replaceChildren(
      elemento('div', { class: 'vazio' }, [
        elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
        elemento('h3', {}, ['Não foi possível carregar os veículos']),
        elemento('p', {}, [erro?.mensagem || 'Tente novamente em instantes.']),
        elemento(
          'button',
          { type: 'button', class: 'btn btn-secundario', onclick: () => carregar() },
          ['Tentar novamente']
        )
      ])
    );
  }

  function mostrarVazio() {
    const semFiltro = !estado.busca && estado.situacao === '1';
    alvo.replaceChildren(
      elemento('div', { class: 'vazio' }, [
        elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['🚛']),
        elemento('h3', {}, [semFiltro ? 'Nenhum veículo cadastrado' : 'Nenhum veículo encontrado']),
        elemento('p', {}, [
          semFiltro
            ? admin
              ? 'Cadastre o primeiro veículo da frota para começar a registrar checklists.'
              : 'Peça a um administrador para cadastrar os veículos da frota.'
            : 'Ajuste a busca ou o filtro de situação para ver outros registros.'
        ]),
        semFiltro && admin
          ? elemento(
              'button',
              { type: 'button', class: 'btn btn-primario', onclick: () => abrirFormulario(null) },
              ['+ Novo veículo']
            )
          : null
      ])
    );
  }

  /* ---------- Tabela ---------- */

  function linhaHtml(veiculo) {
    const descricao = [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || '—';
    const chipSituacao = veiculo.ativo
      ? '<span class="chip chip-ok">Ativo</span>'
      : '<span class="chip chip-na">Inativo</span>';

    const acoes = admin
      ? `<button type="button" class="btn btn-pequeno btn-secundario" data-acao="editar" data-id="${veiculo.id}">Editar</button>
         <button type="button" class="btn btn-pequeno ${veiculo.ativo ? 'btn-fantasma' : 'btn-secundario'}"
                 data-acao="${veiculo.ativo ? 'desativar' : 'reativar'}" data-id="${veiculo.id}">
           ${veiculo.ativo ? 'Desativar' : 'Reativar'}
         </button>`
      : '<span class="texto-fraco texto-pequeno">Somente leitura</span>';

    return `
      <tr class="${veiculo.ativo ? '' : 'linha-inativa'}">
        <td data-rotulo="Placa">
          <span class="placa">${escapar(veiculo.placa)}</span>
        </td>
        <td data-rotulo="Veículo">
          <span class="veiculo-titulo">
            <span>${escapar(descricao)}</span>
            ${veiculo.tipo_carroceria ? `<span class="texto-fraco texto-pequeno">${escapar(veiculo.tipo_carroceria)}</span>` : ''}
          </span>
        </td>
        <td data-rotulo="Lona">${veiculo.possui_lona ? '<span class="badge badge-info">Com lona</span>' : '<span class="texto-fraco texto-pequeno">Sem lona</span>'}</td>
        <td data-rotulo="Checklists" class="numero">${escapar(formatarNumero(veiculo.total_checklists))}</td>
        <td data-rotulo="Último">${escapar(formatarData(veiculo.ultimo_checklist))}</td>
        <td data-rotulo="Situação">${chipSituacao}</td>
        <td data-rotulo="Ações" class="acoes">${acoes}</td>
      </tr>`;
  }

  function mostrarLista(lista) {
    if (!lista.length) {
      mostrarVazio();
      return;
    }

    const envolve = elemento('div', { class: 'tabela-envolve' }, [
      elemento('table', {
        class: 'tabela',
        html: `
          <thead>
            <tr>
              <th scope="col">Placa</th>
              <th scope="col">Veículo</th>
              <th scope="col">Lona</th>
              <th scope="col" class="numero">Checklists</th>
              <th scope="col">Último</th>
              <th scope="col">Situação</th>
              <th scope="col"><span class="sr-apenas">Ações</span></th>
            </tr>
          </thead>
          <tbody>${lista.map(linhaHtml).join('')}</tbody>`
      })
    ]);

    // Delegação: um único ouvinte serve a todas as linhas da página.
    envolve.addEventListener('click', (ev) => {
      const botao = ev.target.closest('button[data-acao]');
      if (!botao) return;

      const veiculo = lista.find((item) => String(item.id) === botao.dataset.id);
      if (!veiculo) return;

      if (botao.dataset.acao === 'editar') abrirFormulario(veiculo);
      else if (botao.dataset.acao === 'desativar') desativar(veiculo);
      else if (botao.dataset.acao === 'reativar') reativar(veiculo);
    });

    alvo.replaceChildren(envolve);
  }

  function mostrarPaginacao() {
    if (estado.paginas <= 1) {
      rodapePaginacao.hidden = true;
      return;
    }

    const irPara = (pagina) => {
      estado.pagina = pagina;
      carregar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const anterior = elemento(
      'button',
      {
        type: 'button',
        class: 'btn btn-pequeno btn-secundario',
        onclick: () => irPara(estado.pagina - 1)
      },
      ['‹ Anterior']
    );
    anterior.disabled = estado.pagina <= 1;

    const proxima = elemento(
      'button',
      {
        type: 'button',
        class: 'btn btn-pequeno btn-secundario',
        onclick: () => irPara(estado.pagina + 1)
      },
      ['Próxima ›']
    );
    proxima.disabled = estado.pagina >= estado.paginas;

    rodapePaginacao.replaceChildren(
      anterior,
      elemento('span', { class: 'paginacao-info' }, [
        `Página ${estado.pagina} de ${estado.paginas} · ${formatarNumero(estado.total)} veículo(s)`
      ]),
      proxima
    );
    rodapePaginacao.hidden = false;
  }

  /* ---------- Cadastro e edição ---------- */

  function abrirFormulario(veiculo) {
    const edicao = Boolean(veiculo);

    const campoPlaca = criarCampo({
      nome: 'placa',
      rotulo: 'Placa *',
      valor: veiculo?.placa ?? '',
      dica: 'Formatos aceitos: ABC1234 ou ABC1D23 (Mercosul).',
      obrigatorio: true,
      atributos: {
        maxlength: 7,
        autocapitalize: 'characters',
        autocomplete: 'off',
        spellcheck: 'false',
        class: 'placa'
      }
    });

    // Máscara: só letras e números, sempre em maiúsculas, no máximo 7 posições.
    campoPlaca.entrada.addEventListener('input', () => {
      const limpo = campoPlaca.entrada.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
      if (limpo !== campoPlaca.entrada.value) campoPlaca.entrada.value = limpo;
      campoPlaca.limpar();
    });

    const campoMarca = criarCampo({
      nome: 'marca',
      rotulo: 'Marca',
      valor: veiculo?.marca ?? '',
      atributos: { maxlength: 60, autocomplete: 'off' }
    });

    const campoModelo = criarCampo({
      nome: 'modelo',
      rotulo: 'Modelo',
      valor: veiculo?.modelo ?? '',
      atributos: { maxlength: 80, autocomplete: 'off' }
    });

    const campoCarroceria = criarCampo({
      nome: 'tipo_carroceria',
      rotulo: 'Tipo de carroceria',
      valor: veiculo?.tipo_carroceria ?? '',
      dica: 'Escolha uma sugestão ou digite outro tipo.',
      atributos: { maxlength: 60, list: 'lista-carrocerias', autocomplete: 'off' }
    });

    const listaCarrocerias = elemento(
      'datalist',
      { id: 'lista-carrocerias' },
      TIPOS_CARROCERIA.map((tipo) => elemento('option', { value: tipo }))
    );

    const campoLona = criarCaixa({
      nome: 'possui_lona',
      rotulo: 'Este veículo possui lona',
      marcado: veiculo?.possui_lona ?? false
    });

    const campoObs = criarCampo({
      nome: 'observacoes',
      rotulo: 'Observações',
      tipo: 'textarea',
      valor: veiculo?.observacoes ?? '',
      cheia: true,
      atributos: { maxlength: 1000 }
    });

    const campos = {
      placa: campoPlaca,
      marca: campoMarca,
      modelo: campoModelo,
      tipo_carroceria: campoCarroceria,
      observacoes: campoObs
    };

    const form = elemento('form', { class: 'form-grade', novalidate: true, autocomplete: 'off' }, [
      campoPlaca.el,
      campoMarca.el,
      campoModelo.el,
      campoCarroceria.el,
      listaCarrocerias,
      campoLona.el,
      campoObs.el
    ]);

    const botaoSalvar = elemento(
      'button',
      { type: 'button', class: 'btn btn-primario', onclick: () => form.requestSubmit() },
      [edicao ? 'Salvar alterações' : 'Cadastrar veículo']
    );

    const botaoCancelar = elemento(
      'button',
      { type: 'button', class: 'btn btn-secundario', onclick: () => fecharModal() },
      ['Cancelar']
    );

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      Object.values(campos).forEach((campo) => campo.limpar());

      const placa = campoPlaca.valor.toUpperCase();
      if (!placa) {
        campoPlaca.marcarErro('Informe a placa do veículo.');
        campoPlaca.entrada.focus();
        return;
      }
      if (!PLACA_VALIDA.test(placa)) {
        campoPlaca.marcarErro('Placa inválida. Use ABC1234 ou ABC1D23.');
        campoPlaca.entrada.focus();
        return;
      }

      const corpo = {
        placa,
        marca: campoMarca.valor,
        modelo: campoModelo.valor,
        tipo_carroceria: campoCarroceria.valor,
        possui_lona: campoLona.valor,
        observacoes: campoObs.valor
      };

      botaoSalvar.disabled = true;
      const rotulo = botaoSalvar.textContent;
      botaoSalvar.textContent = 'Salvando…';

      try {
        if (edicao) await api.put(`/veiculos/${veiculo.id}`, corpo);
        else await api.post('/veiculos', corpo);

        fecharModal();
        toast(edicao ? 'Veículo atualizado.' : 'Veículo cadastrado.', 'sucesso');
        if (!edicao) estado.pagina = 1;
        carregar();
      } catch (erro) {
        // O servidor devolve os campos problemáticos; destacamos cada um.
        if (erro.campos && typeof erro.campos === 'object') {
          for (const [nome, detalhe] of Object.entries(erro.campos)) {
            campos[nome]?.marcarErro(String(detalhe));
          }
        }
        toast(erro.mensagem || 'Não foi possível salvar o veículo.', 'erro');
      } finally {
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = rotulo;
      }
    });

    abrirModal({
      titulo: edicao ? `Editar ${veiculo.placa}` : 'Novo veículo',
      corpo: form,
      acoes: [botaoCancelar, botaoSalvar],
      largo: true
    });

    campoPlaca.entrada.focus();
  }

  /* ---------- Desativar / reativar ---------- */

  async function desativar(veiculo) {
    const confirmado = await confirmar(
      `Desativar o veículo ${veiculo.placa}? Ele deixará de aparecer para novos checklists, mas o histórico é preservado.`,
      { titulo: 'Desativar veículo', textoConfirmar: 'Desativar', perigo: true }
    );
    if (!confirmado) return;

    try {
      await api.del(`/veiculos/${veiculo.id}`);
      toast(`Veículo ${veiculo.placa} desativado.`, 'sucesso');
      carregar();
    } catch (erro) {
      toast(erro.mensagem || 'Não foi possível desativar o veículo.', 'erro');
    }
  }

  async function reativar(veiculo) {
    const confirmado = await confirmar(
      `Reativar o veículo ${veiculo.placa}? Ele voltará a ficar disponível para novos checklists.`,
      { titulo: 'Reativar veículo', textoConfirmar: 'Reativar' }
    );
    if (!confirmado) return;

    try {
      await api.put(`/veiculos/${veiculo.id}`, { ativo: true });
      toast(`Veículo ${veiculo.placa} reativado.`, 'sucesso');
      carregar();
    } catch (erro) {
      toast(erro.mensagem || 'Não foi possível reativar o veículo.', 'erro');
    }
  }

  await carregar();
}
