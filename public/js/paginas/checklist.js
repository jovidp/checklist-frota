/**
 * paginas/checklist.js — formulário de checklist (criação e edição).
 *
 * Tela mais usada do sistema e quase sempre no celular, em pé, ao lado do
 * caminhão: por isso alvos grandes, prévia da situação sempre visível e
 * fotos comprimidas no aparelho.
 *
 * Com `params.id` a mesma tela abre em modo de edição (#/historico/:id/editar):
 * carrega o checklist salvo, preenche tudo e grava com PUT. As fotos já
 * gravadas não trafegam no PUT — são mantidas, removidas uma a uma e as novas
 * enviadas depois, pelos endpoints de foto.
 *
 * Não existe campo "motorista": o responsável é o usuário autenticado
 * (na edição, continua sendo quem criou o checklist).
 */

import { api } from '../api.js';
import { elemento, escapar, spinner, toast, confirmar, hoje, agoraHora } from '../util.js';
import { seletorDeFotos } from '../componentes/fotos.js';

/** Espelha MAX_FOTOS_CHECKLIST do servidor (a validação final é lá). */
const MAX_FOTOS = 20;

const CATEGORIAS = [
  { id: 'inspecao', titulo: 'Itens de inspeção' },
  { id: 'documentacao', titulo: 'Documentação' }
];

const OPCOES_STATUS = [
  { valor: 'OK', rotulo: 'Conforme' },
  { valor: 'NC', rotulo: 'Não conforme' },
  { valor: 'NA', rotulo: 'N/A' }
];

const CLASSE_SELO = {
  APROVADO: 'chip chip-aprovado',
  RESTRICAO: 'chip chip-restricao',
  REPROVADO: 'chip chip-reprovado'
};

const TEXTO_SELO = {
  APROVADO: 'Aprovado',
  RESTRICAO: 'Aprovado com restrição',
  REPROVADO: 'Reprovado'
};

/* Estilos exclusivos do modo de edição: as fotos já gravadas e a marcação de
   remoção. Ficam aqui porque nenhuma outra tela usa esse estado. */
const ESTILO_ID = 'estilo-checklist-edicao';
const ESTILO = `
  .fotos-salvas { display: grid; gap: var(--esp-1); margin-bottom: var(--esp-3); }
  .foto-salva-removida .foto-miniatura {
    opacity: .45;
    outline: 2px dashed var(--vermelho);
    outline-offset: 2px;
  }
  .foto-salva-removida .texto-fraco { color: var(--vermelho); font-weight: 550; }
`;

function garantirEstilo() {
  if (document.getElementById(ESTILO_ID)) return;
  document.head.appendChild(elemento('style', { id: ESTILO_ID, texto: ESTILO }));
}

/** Listagens paginadas chegam como { dados, paginacao }; as demais, como array. */
function comoLista(resposta) {
  if (Array.isArray(resposta)) return resposta;
  if (resposta && Array.isArray(resposta.dados)) return resposta.dados;
  return [];
}

function rotuloVeiculo(veiculo) {
  const partes = [veiculo.placa];
  if (veiculo.modelo) partes.push(veiculo.modelo);
  return partes.join(' · ');
}

/** Bloco de erro com opção de tentar de novo. */
function blocoErro(mensagem, aoTentar) {
  return elemento('div', { class: 'vazio' }, [
    elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
    elemento('h3', {}, ['Não foi possível carregar o formulário']),
    elemento('p', {}, [mensagem]),
    elemento('button', { type: 'button', class: 'btn btn-secundario', onclick: aoTentar }, ['Tentar novamente'])
  ]);
}

function campo(rotulo, controle, { dica = null, cheia = false } = {}) {
  const caixa = elemento('div', { class: `campo${cheia ? ' col-cheia' : ''}` }, [
    elemento('label', { for: controle.id }, [rotulo]),
    controle,
    dica ? elemento('span', { class: 'campo-dica' }, [dica]) : null
  ]);
  return caixa;
}

function marcarInvalido(controle, invalido) {
  const caixa = controle.closest('.campo');
  if (caixa) caixa.classList.toggle('invalido', Boolean(invalido));
}

export default async function render(container, params) {
  // Sem id na rota é um checklist novo; com id, edição do registro existente.
  const idEdicao = params?.id === undefined ? null : Number(params.id);
  const edicao = Number.isInteger(idEdicao) && idEdicao > 0;

  garantirEstilo();
  spinner(container, edicao ? 'Carregando o checklist…' : 'Carregando itens e veículos…');

  let catalogo = [];
  let veiculos = [];
  let original = null;

  try {
    const [respostaItens, respostaVeiculos, respostaChecklist] = await Promise.all([
      api.get('/itens'),
      api.get('/veiculos', { ativo: 1, limite: 100 }),
      edicao ? api.get(`/checklists/${idEdicao}`) : Promise.resolve(null)
    ]);
    catalogo = comoLista(respostaItens);
    // A API já filtra por ativo=1; a segunda checagem evita surpresa se mudar.
    veiculos = comoLista(respostaVeiculos).filter((v) => v.ativo !== false);
    original = respostaChecklist;
  } catch (erro) {
    if (erro?.codigo === 'NAO_AUTENTICADO') return;
    container.replaceChildren(
      blocoErro(erro?.mensagem || 'Tente novamente em instantes.', () => render(container, params))
    );
    return;
  }

  if (edicao && !original) {
    container.replaceChildren(elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
      elemento('h3', {}, ['Checklist não encontrado']),
      elemento('p', {}, ['O registro pode ter sido excluído.']),
      elemento('a', { class: 'btn btn-secundario', href: '#/historico' }, ['Voltar ao histórico'])
    ]));
    return;
  }

  if (!catalogo.length) {
    container.replaceChildren(elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['📋']),
      elemento('h3', {}, ['Nenhum item cadastrado']),
      elemento('p', {}, ['O catálogo de itens de inspeção está vazio. Fale com a administração do sistema.'])
    ]));
    return;
  }

  if (!veiculos.length) {
    container.replaceChildren(elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['🚚']),
      elemento('h3', {}, ['Nenhum veículo ativo']),
      elemento('p', {}, ['Cadastre um veículo antes de iniciar um checklist.']),
      elemento('a', { class: 'btn btn-primario', href: '#/veiculos' }, ['Ir para Veículos'])
    ]));
    return;
  }

  /* ------------------------------------------------------------------------
     Estado do formulário
     ------------------------------------------------------------------------ */
  const usuario = api.usuarioAtual();

  // Mesma regra do servidor: admin edita qualquer um, operador só o que criou.
  // Aqui é só para não abrir um formulário que o PUT recusaria no fim.
  if (edicao && usuario?.perfil !== 'admin' &&
      Number(original.responsavel?.id) !== Number(usuario?.id)) {
    container.replaceChildren(elemento('div', { class: 'vazio' }, [
      elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['🔒']),
      elemento('h3', {}, ['Sem permissão para editar']),
      elemento('p', {}, ['Você só pode alterar checklists criados por você. Fale com a administração se este registro precisa de correção.']),
      elemento('a', { class: 'btn btn-secundario', href: `#/historico/${idEdicao}` }, ['Ver o checklist'])
    ]));
    return;
  }

  const respostas = new Map();       // chave -> { status, observacao }
  const controles = new Map();       // chave -> { botoes, observacao, fotos }
  const seletoresFoto = [];          // todos os seletores (itens + galeria)
  let lonaTocada = false;            // usuário mexeu manualmente no bloco de lona
  let enviando = false;

  for (const item of catalogo) respostas.set(item.chave, { status: 'PEND', observacao: '' });

  /* Fotos já gravadas (só na edição). Ficam fora dos seletores porque vivem no
     servidor: aqui só marcamos quais devem ser apagadas ao salvar. */
  const fotosSalvas = edicao && Array.isArray(original.fotos) ? original.fotos : [];
  const fotosRemovidas = new Set();  // ids marcados para exclusão

  const fotosSalvasPorItem = new Map();
  for (const foto of fotosSalvas) {
    // Foto de item desativado no catálogo não tem mais linha onde aparecer;
    // vai para a galeria geral em vez de sumir da tela sem ninguém notar.
    const chave = foto.item_chave && respostas.has(foto.item_chave) ? foto.item_chave : '';
    if (!fotosSalvasPorItem.has(chave)) fotosSalvasPorItem.set(chave, []);
    fotosSalvasPorItem.get(chave).push(foto);
  }

  const fotosSalvasMantidas = () =>
    fotosSalvas.filter((foto) => !fotosRemovidas.has(foto.id)).length;

  // A cota é do checklist inteiro: fotos já gravadas ocupam lugar das novas.
  const totalFotos = () =>
    fotosSalvasMantidas() + seletoresFoto.reduce((soma, s) => soma + s.fotos.length, 0);

  // Decisão final do responsável: 'APROVADO' | 'REPROVADO' | null.
  // Declarada aqui em cima porque a prévia do resumo depende dela — os botões
  // que a definem ficam lá embaixo, no card "Decisão final".
  let aprovacao = null;

  /** Mesma regra do servidor — aqui só como prévia para o usuário. */
  function calcularPrevia() {
    let ok = 0, nc = 0, na = 0, pendente = 0;
    let criticoReprovado = false;

    for (const item of catalogo) {
      const status = respostas.get(item.chave)?.status || 'PEND';
      if (status === 'OK') ok += 1;
      else if (status === 'NC') {
        nc += 1;
        if (item.critico) criticoReprovado = true;
      } else if (status === 'NA') na += 1;
      else pendente += 1;
    }

    const lonaRuim = lonaPossui() && lonaCondicao() === 'RUIM';
    const comPendencia = nc > 0 || lonaRuim;

    // O que a inspeção sozinha apontaria — usado só no texto de apoio.
    const statusInspecao = criticoReprovado
      ? 'REPROVADO'
      : comPendencia ? 'RESTRICAO' : 'APROVADO';

    // O resultado de verdade: a decisão do responsável manda. Enquanto ele
    // não escolher, o selo mostra o que a inspeção indica.
    const status = aprovacao === 'REPROVADO'
      ? 'REPROVADO'
      : aprovacao === 'APROVADO'
        ? (comPendencia ? 'RESTRICAO' : 'APROVADO')
        : statusInspecao;

    return { status, statusInspecao, totais: { ok, nc, na, pendente } };
  }

  /* ------------------------------------------------------------------------
     Cabeçalho do checklist
     ------------------------------------------------------------------------ */
  const entradaData = elemento('input', { type: 'date', id: 'checklist-data', value: hoje(), required: true });
  const entradaHora = elemento('input', { type: 'time', id: 'checklist-hora', value: agoraHora() });
  const entradaKm = elemento('input', {
    type: 'number', id: 'checklist-km', min: '0', step: '1',
    inputmode: 'numeric', placeholder: 'Ex.: 184320'
  });

  // Veículo desativado depois do lançamento não aparece na lista de ativos.
  // Sem esta opção o select abriria vazio e trocaria o veículo do checklist
  // sem ninguém pedir; assim o usuário vê o motivo (e o servidor ainda recusa
  // salvar com veículo inativo, com mensagem própria).
  const veiculoInativo = edicao && original.veiculo &&
    !veiculos.some((v) => Number(v.id) === Number(original.veiculo.id))
      ? original.veiculo
      : null;

  const seletorVeiculo = elemento('select', { id: 'checklist-veiculo', required: true }, [
    elemento('option', { value: '' }, ['Selecione o veículo…']),
    ...veiculos.map((v) => elemento('option', { value: String(v.id) }, [rotuloVeiculo(v)])),
    veiculoInativo
      ? elemento('option', { value: String(veiculoInativo.id) }, [`${rotuloVeiculo(veiculoInativo)} (inativo)`])
      : null
  ]);

  // Na edição quem responde continua sendo quem criou — um admin corrigindo o
  // registro de outra pessoa não toma o lugar dela.
  const responsavel = edicao ? (original.responsavel?.nome || '—') : (usuario?.nome || '—');

  const cardCabecalho = elemento('section', { class: 'card' }, [
    elemento('div', { class: 'card-topo' }, [
      elemento('h2', {}, ['Dados do checklist']),
      elemento('span', { class: 'chip chip-info' }, [`Responsável: ${responsavel}`])
    ]),
    elemento('div', { class: 'form-grade' }, [
      campo('Veículo', seletorVeiculo, { cheia: true, dica: 'Apenas veículos ativos aparecem na lista.' }),
      campo('Data', entradaData),
      campo('Hora', entradaHora),
      campo('KM do odômetro', entradaKm, { cheia: true, dica: 'Opcional, mas ajuda no acompanhamento da frota.' })
    ])
  ]);

  /* ------------------------------------------------------------------------
     Resumo ao vivo
     ------------------------------------------------------------------------ */
  const selo = elemento('span', { class: CLASSE_SELO.APROVADO }, [TEXTO_SELO.APROVADO]);

  function indicador(rotulo, classe) {
    const valor = elemento('div', { class: 'indicador-valor' }, ['0']);
    const bloco = elemento('div', { class: `indicador ${classe}` }, [
      elemento('div', { class: 'indicador-rotulo' }, [rotulo]),
      valor
    ]);
    return { bloco, valor };
  }

  const contadorOk = indicador('Conformes', 'ok');
  const contadorNc = indicador('Não conformes', 'reprovado');
  const contadorNa = indicador('N/A', '');
  const contadorPendente = indicador('Não informados', 'restricao');
  const infoFotos = elemento('span', { class: 'texto-pequeno texto-suave' });

  const botaoTudoOk = elemento('button', {
    type: 'button',
    class: 'btn btn-secundario btn-pequeno',
    onclick: marcarTudoComoOk
  }, ['Marcar tudo como OK']);

  const cardResumo = elemento('section', { class: 'card' }, [
    elemento('div', { class: 'card-topo' }, [
      elemento('h2', {}, ['Resumo']),
      selo
    ]),
    elemento('div', { class: 'grade grade-4' }, [
      contadorOk.bloco, contadorNc.bloco, contadorNa.bloco, contadorPendente.bloco
    ]),
    elemento('div', { class: 'barra-acoes', style: { marginTop: 'var(--esp-4)' } }, [
      infoFotos,
      elemento('span', { style: { marginLeft: 'auto' } }, [botaoTudoOk])
    ]),
    elemento('p', { class: 'texto-pequeno texto-fraco', style: { marginTop: 'var(--esp-3)', marginBottom: '0' } }, [
      'Prévia calculada neste aparelho. A situação oficial é definida pelo servidor ao salvar.'
    ])
  ]);

  function atualizarResumo() {
    const { status, statusInspecao, totais } = calcularPrevia();
    contadorOk.valor.textContent = String(totais.ok);
    contadorNc.valor.textContent = String(totais.nc);
    contadorNa.valor.textContent = String(totais.na);
    contadorPendente.valor.textContent = String(totais.pendente);
    selo.className = CLASSE_SELO[status];
    selo.textContent = TEXTO_SELO[status];
    infoFotos.textContent = `Fotos anexadas: ${totalFotos()} de ${MAX_FOTOS}`;
    atualizarSugestao(statusInspecao);
  }

  /* ------------------------------------------------------------------------
     Itens
     ------------------------------------------------------------------------ */
  function definirStatus(chave, status) {
    const resposta = respostas.get(chave);
    if (!resposta) return;
    resposta.status = status;

    const controle = controles.get(chave);
    controle?.botoes.forEach((botao) => {
      botao.setAttribute('aria-pressed', String(botao.dataset.status === status));
    });

    atualizarResumo();
  }

  function marcarTudoComoOk() {
    for (const item of catalogo) definirStatus(item.chave, 'OK');
    toast('Todos os itens foram marcados como conformes. Revise antes de salvar.', 'info');
  }

  /* ------------------------------------------------------------------------
     Fotos já gravadas (edição)
     Não entram no seletor: elas moram no servidor. O ✕ só marca a intenção;
     a exclusão de verdade acontece ao salvar, e dá para voltar atrás antes.
     ------------------------------------------------------------------------ */
  function blocoFotosSalvas(itemChave) {
    const lista = fotosSalvasPorItem.get(itemChave || '') || [];
    if (!lista.length) return null;

    const grade = elemento('div', { class: 'grade-fotos' });

    function desenhar() {
      grade.replaceChildren(...lista.map((foto) => {
        const marcada = fotosRemovidas.has(foto.id);

        const acao = elemento('button', {
          type: 'button',
          class: 'foto-remover',
          'aria-label': marcada ? 'Manter esta foto' : 'Remover esta foto ao salvar',
          title: marcada ? 'Manter esta foto' : 'Remover esta foto ao salvar',
          onclick: () => {
            if (marcada) fotosRemovidas.delete(foto.id);
            else fotosRemovidas.add(foto.id);
            desenhar();
            atualizarResumo();
          }
        }, [marcada ? '↺' : '✕']);

        return elemento('div', {
          class: `fotos-celula foto-salva${marcada ? ' foto-salva-removida' : ''}`
        }, [
          elemento('div', { class: 'foto-miniatura' }, [
            elemento('img', {
              src: foto.url,
              alt: foto.legenda || 'Foto já salva neste checklist',
              loading: 'lazy'
            }),
            acao
          ]),
          elemento('span', { class: 'texto-pequeno texto-fraco' }, [
            marcada ? 'Será removida ao salvar' : (foto.legenda || 'Foto salva')
          ])
        ]);
      }));
    }

    desenhar();

    return elemento('div', { class: 'fotos-salvas' }, [
      elemento('p', {
        class: 'texto-pequeno texto-fraco',
        style: { margin: '0 0 var(--esp-1)' }
      }, ['Fotos já salvas']),
      grade
    ]);
  }

  function blocoItem(item) {
    const botoes = OPCOES_STATUS.map((opcao) => elemento('button', {
      type: 'button',
      class: 'opcao-status',
      dataset: { status: opcao.valor },
      'aria-pressed': 'false',
      onclick: () => {
        // Tocar de novo na opção já marcada volta o item para "não informado".
        const atual = respostas.get(item.chave).status;
        definirStatus(item.chave, atual === opcao.valor ? 'PEND' : opcao.valor);
      }
    }, [opcao.rotulo]));

    const observacao = elemento('input', {
      type: 'text',
      class: 'item-observacao',
      maxlength: '400',
      placeholder: 'Observação (opcional)',
      'aria-label': `Observação de ${item.nome}`
    });
    observacao.addEventListener('input', () => {
      respostas.get(item.chave).observacao = observacao.value;
    });

    // A cota de fotos é global: cada seletor só enxerga o que ainda sobra.
    let seletor;
    seletor = seletorDeFotos({
      itemChave: item.chave,
      rotulo: 'Foto do item',
      // seletor ainda é undefined na 1ª chamada (o componente calcula o limite
      // durante a própria construção) — nesse instante ele tem zero fotos.
      max: () => MAX_FOTOS - totalFotos() + (seletor ? seletor.fotos.length : 0),
      aoMudar: atualizarResumo
    });
    seletoresFoto.push(seletor);

    controles.set(item.chave, { botoes, observacao, fotos: seletor });

    return elemento('div', { class: 'item-checklist' }, [
      elemento('div', {
        class: 'item-cabecalho',
        html: `<span class="item-nome">${escapar(item.nome)}</span>` +
          (item.critico ? '<span class="badge badge-critico">Crítico</span>' : '')
      }),
      item.dica ? elemento('p', { class: 'item-dica' }, [item.dica]) : null,
      elemento('div', {
        class: 'seletor-status',
        role: 'group',
        'aria-label': `Situação de ${item.nome}`
      }, botoes),
      elemento('div', { class: 'item-extra' }, [
        observacao,
        blocoFotosSalvas(item.chave),
        seletor.elemento
      ])
    ]);
  }

  const entradaCrlv = elemento('input', { type: 'date', id: 'checklist-crlv' });
  const entradaTacografo = elemento('input', { type: 'date', id: 'checklist-tacografo' });

  const cardsCategorias = CATEGORIAS.map(({ id, titulo }) => {
    const itens = catalogo.filter((item) => item.categoria === id);
    if (!itens.length) return null;

    const filhos = [
      elemento('div', { class: 'card-topo' }, [
        elemento('h2', {}, [titulo]),
        elemento('span', { class: 'texto-pequeno texto-fraco' }, [
          `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`
        ])
      ]),
      ...itens.map(blocoItem)
    ];

    // Validades só fazem sentido junto da documentação.
    if (id === 'documentacao') {
      filhos.push(elemento('div', {
        class: 'form-grade',
        style: { marginTop: 'var(--esp-4)' }
      }, [
        campo('Validade do CRLV', entradaCrlv),
        campo('Validade da aferição do tacógrafo', entradaTacografo)
      ]));
    }

    return elemento('section', { class: 'card' }, filhos);
  }).filter(Boolean);

  /* ------------------------------------------------------------------------
     Lona
     ------------------------------------------------------------------------ */
  const lonaSim = elemento('input', { type: 'radio', name: 'lona-possui', value: 'sim' });
  const lonaNao = elemento('input', { type: 'radio', name: 'lona-possui', value: 'nao', checked: true });
  const lonaBoa = elemento('input', { type: 'radio', name: 'lona-condicao', value: 'BOA', checked: true });
  const lonaRuim = elemento('input', { type: 'radio', name: 'lona-condicao', value: 'RUIM' });
  const lonaObs = elemento('textarea', {
    id: 'lona-obs', maxlength: '500', placeholder: 'Observações sobre a lona (opcional)'
  });

  const lonaDetalhes = elemento('div', { class: 'item-extra', hidden: true }, [
    elemento('fieldset', {}, [
      elemento('legend', {}, ['Condição da lona']),
      elemento('div', { class: 'seletor-status', style: { gridTemplateColumns: 'repeat(2, 1fr)' } }, [
        elemento('label', { class: 'caixa-marcar' }, [lonaBoa, 'Boas condições']),
        elemento('label', { class: 'caixa-marcar' }, [lonaRuim, 'Danificada'])
      ])
    ]),
    campo('Observações da lona', lonaObs)
  ]);

  const lonaPossui = () => lonaSim.checked;
  const lonaCondicao = () => (lonaRuim.checked ? 'RUIM' : 'BOA');

  function sincronizarLona() {
    lonaDetalhes.hidden = !lonaPossui();
    atualizarResumo();
  }

  [lonaSim, lonaNao].forEach((radio) => radio.addEventListener('change', () => {
    lonaTocada = true;
    sincronizarLona();
  }));
  [lonaBoa, lonaRuim].forEach((radio) => radio.addEventListener('change', atualizarResumo));

  const cardLona = elemento('section', { class: 'card' }, [
    elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Lona'])]),
    elemento('fieldset', {}, [
      elemento('legend', {}, ['O veículo possui lona?']),
      elemento('div', { class: 'seletor-status', style: { gridTemplateColumns: 'repeat(2, 1fr)' } }, [
        elemento('label', { class: 'caixa-marcar' }, [lonaSim, 'Sim']),
        elemento('label', { class: 'caixa-marcar' }, [lonaNao, 'Não'])
      ])
    ]),
    lonaDetalhes
  ]);

  // Veículo cadastrado com lona já marca "Sim" — desde que ninguém tenha mexido.
  seletorVeiculo.addEventListener('change', () => {
    marcarInvalido(seletorVeiculo, false);
    const veiculo = veiculos.find((v) => String(v.id) === seletorVeiculo.value);
    if (!veiculo || lonaTocada) return;
    if (veiculo.possui_lona === true) lonaSim.checked = true;
    else lonaNao.checked = true;
    sincronizarLona();
  });

  /* ------------------------------------------------------------------------
     Observações gerais e galeria
     ------------------------------------------------------------------------ */
  const obsGeral = elemento('textarea', {
    id: 'checklist-obs', maxlength: '2000',
    placeholder: 'Observações gerais do checklist (opcional)'
  });

  let galeria;
  galeria = seletorDeFotos({
    itemChave: null,
    rotulo: 'Adicionar foto',
    // Mesmo caso do seletor por item: undefined na 1ª chamada, ainda sem fotos.
    max: () => MAX_FOTOS - totalFotos() + (galeria ? galeria.fotos.length : 0),
    aoMudar: atualizarResumo
  });
  seletoresFoto.push(galeria);

  const cardFinal = elemento('section', { class: 'card' }, [
    elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Observações e fotos gerais'])]),
    campo('Observações gerais', obsGeral),
    elemento('div', { style: { marginTop: 'var(--esp-4)' } }, [
      elemento('h3', {}, ['Fotos do checklist']),
      elemento('p', { class: 'texto-pequeno texto-fraco' }, [
        `As imagens são reduzidas automaticamente antes do envio. Limite de ${MAX_FOTOS} fotos por checklist, somando itens e galeria.`
      ]),
      blocoFotosSalvas(null),
      galeria.elemento
    ])
  ]);

  /* ------------------------------------------------------------------------
     Decisão final — a última pergunta antes de salvar
     O sistema calcula uma sugestão a partir dos itens, mas quem libera (ou
     não) o caminhão é o responsável: a decisão dele sobrepõe o cálculo. Se
     aprovar, o checklist nunca sai como reprovado — no máximo "com restrição",
     para o registro guardar que a liberação teve pendência.
     (`aprovacao` é declarada lá em cima, junto de calcularPrevia.)
     ------------------------------------------------------------------------ */
  const OPCOES_DECISAO = [
    { valor: 'APROVADO', rotulo: '✓ Aprovo o veículo' },
    { valor: 'REPROVADO', rotulo: '✕ Não aprovo o veículo' }
  ];

  const botoesDecisao = OPCOES_DECISAO.map((opcao) => elemento('button', {
    type: 'button',
    class: 'opcao-status opcao-decisao',
    dataset: { decisao: opcao.valor },
    'aria-pressed': 'false',
    onclick: () => definirAprovacao(opcao.valor)
  }, [opcao.rotulo]));

  const sugestao = elemento('p', { class: 'texto-pequeno texto-fraco', style: { margin: '0' } });

  const cardDecisao = elemento('section', { class: 'card card-decisao' }, [
    elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Decisão final'])]),
    elemento('fieldset', {}, [
      elemento('legend', {}, ['Você aprova o veículo?']),
      elemento('div', {
        class: 'seletor-decisao',
        role: 'group',
        'aria-label': 'Decisão final sobre o veículo'
      }, botoesDecisao)
    ]),
    elemento('p', {
      class: 'texto-pequeno texto-fraco',
      style: { marginTop: 'var(--esp-3)', marginBottom: 'var(--esp-1)' }
    }, ['Resposta obrigatória: é ela que libera ou barra o caminhão.']),
    sugestao
  ]);

  function definirAprovacao(valor) {
    aprovacao = valor;
    for (const botao of botoesDecisao) {
      botao.setAttribute('aria-pressed', String(botao.dataset.decisao === valor));
    }
    cardDecisao.classList.remove('invalido');
    atualizarResumo(); // o selo do resumo segue a decisão
  }

  /**
   * Mostra o que a inspeção sozinha apontaria, sem escolher pelo usuário.
   * Recebe o status só dos itens — não o resultado final, que já leva a
   * decisão em conta.
   */
  function atualizarSugestao(statusInspecao) {
    sugestao.textContent = statusInspecao === 'REPROVADO'
      ? 'Atenção: há item crítico não conforme. Se ainda assim aprovar, o checklist fica como "Aprovado com restrição".'
      : statusInspecao === 'RESTRICAO'
        ? 'A inspeção apontou não conformidades. Se aprovar, o checklist fica como "Aprovado com restrição".'
        : 'A inspeção não apontou não conformidades.';
  }

  /* ------------------------------------------------------------------------
     Ações
     ------------------------------------------------------------------------ */
  const ROTULO_SALVAR = edicao ? 'Salvar alterações' : 'Salvar checklist';
  const botaoSalvar = elemento('button', { type: 'submit', class: 'btn btn-primario' }, [ROTULO_SALVAR]);

  // Na criação "Limpar" zera o formulário. Na edição isso seria uma armadilha
  // (zerar não é voltar ao que está salvo), então a saída oferecida é cancelar.
  const botaoSecundario = edicao
    ? elemento('a', { class: 'btn btn-secundario', href: `#/historico/${idEdicao}` }, ['Cancelar'])
    : elemento('button', {
        type: 'button', class: 'btn btn-secundario', onclick: limparFormulario
      }, ['Limpar']);

  const barraAcoes = elemento('div', { class: 'barra-acoes' }, [botaoSalvar, botaoSecundario]);

  const formulario = elemento('form', { novalidate: true }, [
    cardCabecalho,
    cardResumo,
    ...cardsCategorias,
    cardLona,
    cardFinal,
    cardDecisao,
    barraAcoes
  ]);
  formulario.addEventListener('submit', salvar);

  async function limparFormulario() {
    const confirmado = await confirmar(
      'Todos os dados preenchidos, inclusive as fotos, serão descartados. Deseja continuar?',
      { titulo: 'Limpar formulário', textoConfirmar: 'Limpar', perigo: true }
    );
    if (!confirmado) return;

    formulario.reset(); // devolve data/hora padrão e limpa textos e rádios
    for (const item of catalogo) {
      respostas.get(item.chave).observacao = '';
      definirStatus(item.chave, 'PEND');
    }
    seletoresFoto.forEach((s) => s.limpar());
    lonaTocada = false;
    aprovacao = null;
    for (const botao of botoesDecisao) botao.setAttribute('aria-pressed', 'false');
    cardDecisao.classList.remove('invalido');
    sincronizarLona();
    marcarInvalido(seletorVeiculo, false);
    marcarInvalido(entradaData, false);
    marcarInvalido(entradaKm, false);
    atualizarResumo();
    toast('Formulário limpo.', 'info');
    seletorVeiculo.focus();
  }

  /** Fotos escolhidas agora neste aparelho (ainda não estão no servidor). */
  function fotosNovas() {
    return seletoresFoto.flatMap((seletor) => seletor.fotos.map((foto) => ({
      item_chave: foto.item_chave,
      legenda: foto.legenda.trim(),
      dados: foto.dados
    })));
  }

  function montarPayload() {
    const km = entradaKm.value.trim();
    const possuiLona = lonaPossui();

    const payload = {
      veiculo_id: Number(seletorVeiculo.value),
      data: entradaData.value,
      hora: entradaHora.value || null,
      km: km === '' ? null : Number(km),
      crlv_validade: entradaCrlv.value || null,
      tacografo_validade: entradaTacografo.value || null,
      lona_possui: possuiLona,
      // O servidor ignora a condição quando não há lona; enviamos null por clareza.
      lona_condicao: possuiLona ? lonaCondicao() : null,
      lona_obs: possuiLona ? lonaObs.value.trim() : '',
      obs_geral: obsGeral.value.trim(),
      aprovacao,
      itens: catalogo.map((item) => ({
        chave: item.chave,
        status: respostas.get(item.chave).status,
        observacao: respostas.get(item.chave).observacao.trim()
      }))
    };

    // O POST cria checklist e fotos numa transação só. O PUT não mexe em foto:
    // as já gravadas seriam reenviadas como novas e duplicariam a galeria.
    if (!edicao) payload.fotos = fotosNovas();

    return payload;
  }

  /**
   * Aplica no servidor o que o PUT não cobre: apaga as fotos marcadas e envia
   * as novas. Devolve quantas operações falharam — nenhuma delas invalida o
   * que já foi salvo no checklist.
   */
  async function sincronizarFotos() {
    let falhas = 0;

    for (const idFoto of fotosRemovidas) {
      try {
        await api.del(`/fotos/${idFoto}`);
      } catch (erro) {
        if (erro?.codigo === 'NAO_AUTENTICADO') throw erro;
        // Já não existe: o resultado desejado é justamente esse.
        if (erro?.codigo !== 'NAO_ENCONTRADO') falhas += 1;
      }
    }

    for (const foto of fotosNovas()) {
      try {
        await api.post(`/checklists/${idEdicao}/fotos`, foto);
      } catch (erro) {
        if (erro?.codigo === 'NAO_AUTENTICADO') throw erro;
        falhas += 1;
      }
    }

    return falhas;
  }

  async function salvar(evento) {
    evento.preventDefault();
    if (enviando) return;

    marcarInvalido(seletorVeiculo, false);
    marcarInvalido(entradaData, false);
    marcarInvalido(entradaKm, false);

    if (!seletorVeiculo.value) {
      marcarInvalido(seletorVeiculo, true);
      seletorVeiculo.focus();
      toast('Selecione o veículo do checklist.', 'erro');
      return;
    }

    if (!entradaData.value) {
      marcarInvalido(entradaData, true);
      entradaData.focus();
      toast('Informe a data do checklist.', 'erro');
      return;
    }

    const km = entradaKm.value.trim();
    if (km !== '' && (!/^\d+$/.test(km) || Number(km) < 0)) {
      marcarInvalido(entradaKm, true);
      entradaKm.focus();
      toast('O KM deve ser um número inteiro positivo.', 'erro');
      return;
    }

    if (totalFotos() > MAX_FOTOS) {
      toast(`São permitidas no máximo ${MAX_FOTOS} fotos por checklist.`, 'erro');
      return;
    }

    // A decisão fecha o checklist: sem ela não há o que salvar.
    if (!aprovacao) {
      cardDecisao.classList.add('invalido');
      cardDecisao.scrollIntoView({ behavior: 'smooth', block: 'center' });
      botoesDecisao[0].focus();
      toast('Informe se você aprova ou não o veículo.', 'erro');
      return;
    }

    const { totais } = calcularPrevia();
    if (totais.pendente > 0) {
      const plural = totais.pendente === 1;
      const seguir = await confirmar(
        `${totais.pendente} ${plural ? 'item ficou' : 'itens ficaram'} sem resposta e ${plural ? 'será registrado' : 'serão registrados'} como não informado. Deseja salvar assim?`,
        { titulo: 'Itens não informados', textoConfirmar: 'Salvar mesmo assim' }
      );
      if (!seguir) return;
    }

    enviando = true;
    botaoSalvar.disabled = true;
    botaoSalvar.setAttribute('aria-busy', 'true');
    botaoSalvar.textContent = 'Salvando…';

    try {
      if (edicao) {
        await api.put(`/checklists/${idEdicao}`, montarPayload());
        const falhas = await sincronizarFotos();

        if (falhas > 0) {
          toast(
            `Alterações salvas, mas ${falhas} ${falhas === 1 ? 'foto não foi processada' : 'fotos não foram processadas'}. Reabra a edição para tentar de novo.`,
            'alerta'
          );
        } else {
          toast('Alterações salvas.', 'sucesso');
        }

        location.hash = `#/historico/${idEdicao}`;
      } else {
        const criado = await api.post('/checklists', montarPayload());
        toast('Checklist salvo com sucesso.', 'sucesso');
        location.hash = `#/historico/${criado.id}`;
      }
    } catch (erro) {
      if (erro?.codigo === 'NAO_AUTENTICADO') return;
      toast(erro?.mensagem || 'Não foi possível salvar o checklist.', 'erro');
      // Campos recusados pelo servidor: destacamos os que existem nesta tela.
      const mapa = { veiculo_id: seletorVeiculo, data: entradaData, km: entradaKm };
      for (const nome of Object.keys(erro?.campos || {})) {
        if (mapa[nome]) marcarInvalido(mapa[nome], true);
      }
      if (erro?.campos?.aprovacao) cardDecisao.classList.add('invalido');
    } finally {
      enviando = false;
      botaoSalvar.disabled = false;
      botaoSalvar.removeAttribute('aria-busy');
      botaoSalvar.textContent = ROTULO_SALVAR;
    }
  }

  /* ------------------------------------------------------------------------
     Preenchimento com o que está salvo (edição)
     Só pode rodar com a tela inteira montada: os controles de cada item
     nascem durante a construção dos cards de categoria.
     ------------------------------------------------------------------------ */
  function preencherComOriginal() {
    seletorVeiculo.value = String(original.veiculo?.id ?? '');
    entradaData.value = original.data || hoje();
    entradaHora.value = original.hora || '';
    entradaKm.value = original.km === null || original.km === undefined ? '' : String(original.km);
    entradaCrlv.value = original.crlv_validade || '';
    entradaTacografo.value = original.tacografo_validade || '';

    // Marcamos a lona como "tocada": o preenchimento automático a partir do
    // cadastro do veículo não pode sobrescrever o que a inspeção registrou.
    lonaTocada = true;
    const possuiLona = original.lona_possui === true;
    lonaSim.checked = possuiLona;
    lonaNao.checked = !possuiLona;
    lonaRuim.checked = original.lona_condicao === 'RUIM';
    lonaBoa.checked = !lonaRuim.checked;
    lonaObs.value = original.lona_obs || '';
    lonaDetalhes.hidden = !possuiLona;

    obsGeral.value = original.obs_geral || '';

    for (const item of Array.isArray(original.itens) ? original.itens : []) {
      // Item desativado no catálogo depois do lançamento não tem controle aqui.
      if (!respostas.has(item.chave)) continue;
      const observacao = item.observacao || '';
      respostas.get(item.chave).observacao = observacao;
      const controle = controles.get(item.chave);
      if (controle) controle.observacao.value = observacao;
      definirStatus(item.chave, item.status || 'PEND');
    }

    if (original.aprovacao) definirAprovacao(original.aprovacao);
  }

  /* ------------------------------------------------------------------------
     Montagem final
     ------------------------------------------------------------------------ */
  const topo = elemento('div', { class: 'pagina-topo' }, [
    elemento('div', {}, [
      elemento('h1', {}, [edicao ? 'Editar checklist' : 'Novo checklist']),
      elemento('p', { class: 'pagina-sub' }, [
        edicao
          ? `Ficha nº ${original.id} · ${original.veiculo?.placa || '—'} · Responsável: ${responsavel}`
          : `Responsável: ${usuario?.nome || 'usuário autenticado'}`
      ])
    ])
  ]);

  container.replaceChildren(topo, formulario);
  if (edicao) preencherComOriginal();
  atualizarResumo();
  seletorVeiculo.focus();
}
