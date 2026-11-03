/**
 * detalhe.js — ficha completa de um checklist, pronta para impressão/PDF.
 * Traz cabeçalho do veículo, itens por categoria, validades, lona,
 * observações e galeria de fotos com lightbox.
 */

import { api } from '../api.js';
import {
  elemento, escapar, formatarData, formatarDataHora, formatarNumero,
  spinner, toast, confirmar, abrirModal, fecharModal,
  ROTULOS, ROTULO_STATUS
} from '../util.js';

const CATEGORIAS = [
  { chave: 'inspecao', rotulo: 'Inspeção do veículo' },
  { chave: 'documentacao', rotulo: 'Documentação e obrigatórios' }
];

const CONDICAO_LONA = { BOA: 'Boa', RUIM: 'Ruim' };

/* Decisão final do responsável — registros anteriores a este campo vêm nulos. */
const APROVACAO = {
  APROVADO: { rotulo: 'Veículo aprovado', chip: 'chip-aprovado' },
  REPROVADO: { rotulo: 'Veículo não aprovado', chip: 'chip-reprovado' }
};

/* Estilos exclusivos desta ficha: assinaturas e ajustes de impressão.
   Ficam aqui porque não são reaproveitados por nenhuma outra tela. */
const ESTILO_ID = 'estilo-detalhe-checklist';
const ESTILO = `
  .ficha-cabecalho { display: flex; flex-wrap: wrap; gap: var(--esp-3); align-items: flex-start; justify-content: space-between; }
  .ficha-placa { font-size: 1.6rem; }
  .ficha-titulo-impressao { display: none; }
  .assinaturas { display: grid; gap: var(--esp-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); margin-top: var(--esp-5); }
  .assinatura { padding-top: var(--esp-6); }
  .assinatura-linha { border-top: 1px solid var(--texto-suave); padding-top: var(--esp-2); text-align: center; font-size: .8rem; color: var(--texto-suave); }
  .item-ficha-obs { margin: var(--esp-2) 0 0; font-size: .88rem; }
  .validade-linha { display: flex; flex-wrap: wrap; gap: var(--esp-2); align-items: center; }
  @media print {
    .ficha-titulo-impressao { display: block; margin-bottom: 8pt; }
    .assinatura { padding-top: 46pt; }
    .assinaturas { break-inside: avoid; }
  }
`;

function garantirEstilo() {
  if (document.getElementById(ESTILO_ID)) return;
  document.head.appendChild(elemento('style', { id: ESTILO_ID, texto: ESTILO }));
}

/* --------------------------------------------------------------------------
   Auxiliares
   -------------------------------------------------------------------------- */

/** Dias entre hoje e a data informada (negativo = já venceu). */
function diasAte(iso) {
  const casa = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!casa) return null;
  const alvo = Date.UTC(Number(casa[1]), Number(casa[2]) - 1, Number(casa[3]));
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo - hoje) / 86400000);
}

/** Vermelho se vencido, âmbar se vence em até 30 dias, verde se em dia. */
function chipValidade(iso) {
  const dias = diasAte(iso);
  if (dias === null) return elemento('span', { class: 'chip chip-na' }, ['Não informado']);
  if (dias < 0) {
    const quanto = Math.abs(dias);
    return elemento('span', { class: 'chip chip-reprovado' }, [
      `Vencido há ${quanto} dia${quanto === 1 ? '' : 's'}`
    ]);
  }
  if (dias <= 30) {
    return elemento('span', { class: 'chip chip-restricao' }, [
      dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias === 1 ? '' : 's'}`
    ]);
  }
  return elemento('span', { class: 'chip chip-aprovado' }, ['Em dia']);
}

function chipSituacao(status) {
  const chave = String(status || '').toLowerCase();
  return elemento('span', { class: `chip chip-${chave || 'na'}` }, [
    ROTULO_STATUS[status] || status || '—'
  ]);
}

function chipAprovacao(aprovacao) {
  const info = APROVACAO[aprovacao];
  if (!info) return elemento('span', { class: 'chip chip-na' }, ['Decisão não registrada']);
  return elemento('span', { class: `chip ${info.chip}` }, [info.rotulo]);
}

function definicao(rotulo, valor) {
  return elemento('div', {}, [
    elemento('dt', {}, [rotulo]),
    elemento('dd', {}, [valor ?? '—'])
  ]);
}

/* --------------------------------------------------------------------------
   Página
   -------------------------------------------------------------------------- */

export default async function render(container, params) {
  garantirEstilo();

  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    container.replaceChildren(blocoAviso('Checklist inválido', 'O endereço acessado não aponta para um checklist válido.'));
    return;
  }

  spinner(container, 'Carregando checklist…');

  let checklist;
  try {
    checklist = await api.get(`/checklists/${id}`);
  } catch (erro) {
    if (erro?.codigo === 'NAO_AUTENTICADO') return; // app.js já exibe o login
    container.replaceChildren(blocoAviso(
      erro?.codigo === 'NAO_ENCONTRADO' ? 'Checklist não encontrado' : 'Não foi possível carregar',
      erro?.mensagem || 'Tente novamente em instantes.'
    ));
    return;
  }

  if (!checklist) {
    container.replaceChildren(blocoAviso('Checklist não encontrado', 'O registro pode ter sido excluído.'));
    return;
  }

  const usuario = api.usuarioAtual();
  const ehAdmin = usuario?.perfil === 'admin';
  // Mesma regra do servidor: admin corrige qualquer ficha, operador só a dele.
  const podeEditar = ehAdmin ||
    Number(usuario?.id) === Number(checklist.responsavel?.id);
  const fotos = Array.isArray(checklist.fotos) ? checklist.fotos : [];

  // Índice da foto na galeria, para o lightbox abrir na posição certa
  // tanto pela miniatura do item quanto pela galeria geral.
  const indicePorId = new Map(fotos.map((foto, indice) => [foto.id, indice]));

  container.replaceChildren(
    barraAcoes(),
    tituloImpressao(),
    cartaoCabecalho(),
    cartaoDocumentos(),
    ...cartoesItens(),
    cartaoLona(),
    cartaoObservacoes(),
    cartaoGaleria(),
    cartaoDecisao(),
    cartaoAssinaturas()
  );

  /* ------------------------------------------------------------- blocos */

  function barraAcoes() {
    const acoes = [
      elemento('a', { class: 'btn btn-secundario', href: '#/historico' }, ['‹ Voltar']),
      elemento('button', {
        type: 'button',
        class: 'btn btn-primario',
        onclick: () => window.print()
      }, ['🖨 Imprimir / Salvar PDF'])
    ];

    if (podeEditar) {
      acoes.push(elemento('a', {
        class: 'btn btn-secundario',
        href: `#/historico/${checklist.id}/editar`
      }, ['✎ Editar']));
    }

    if (ehAdmin) {
      acoes.push(elemento('button', {
        type: 'button',
        class: 'btn btn-perigo',
        onclick: excluir
      }, ['Excluir']));
    }

    return elemento('div', { class: 'barra-acoes', style: { marginBottom: 'var(--esp-4)' } }, acoes);
  }

  /** Cabeçalho que só aparece no papel, identificando o documento. */
  function tituloImpressao() {
    const placa = checklist.veiculo?.placa || '—';
    return elemento('div', { class: 'ficha-titulo-impressao' }, [
      elemento('h1', {}, ['Checklist de Caminhões']),
      elemento('p', { class: 'texto-pequeno texto-suave' }, [
        `Ficha nº ${checklist.id} · Veículo ${placa} · ${formatarData(checklist.data)} ${checklist.hora || ''}`
      ])
    ]);
  }

  function cartaoCabecalho() {
    const veiculo = checklist.veiculo || {};
    const resumo = checklist.resumo || {};

    const identificacaoHtml =
      `<div class="placa ficha-placa">${escapar(veiculo.placa || '—')}</div>` +
      `<div class="texto-suave texto-pequeno">${escapar(
        [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Modelo não informado'
      )}</div>`;

    const cabecalho = elemento('div', { class: 'ficha-cabecalho' }, [
      elemento('div', { html: identificacaoHtml }),
      elemento('div', { class: 'ficha-contadores' }, [
        chipAprovacao(checklist.aprovacao),
        chipSituacao(checklist.status)
      ])
    ]);

    const dados = elemento('dl', { class: 'definicoes', style: { marginTop: 'var(--esp-4)' } }, [
      definicao('Carroceria', veiculo.tipo_carroceria || '—'),
      definicao('Data', formatarData(checklist.data)),
      definicao('Hora', checklist.hora || '—'),
      definicao('Quilometragem', `${formatarNumero(checklist.km)} km`),
      definicao('Responsável pela inspeção', checklist.responsavel?.nome || '—'),
      definicao('Registrado em', formatarDataHora(checklist.criado_em)),
      // Só aparece se a ficha foi mesmo editada — na criação as duas datas
      // nascem iguais, gravadas pelo mesmo INSERT.
      checklist.atualizado_em && checklist.atualizado_em !== checklist.criado_em
        ? definicao('Última alteração', formatarDataHora(checklist.atualizado_em))
        : null
    ]);

    const contadores = elemento('div', {
      class: 'ficha-contadores',
      style: { marginTop: 'var(--esp-4)' }
    }, [
      elemento('span', { class: 'chip chip-ok' }, [`${resumo.ok || 0} conforme(s)`]),
      elemento('span', { class: 'chip chip-nc' }, [`${resumo.nc || 0} não conforme(s)`]),
      elemento('span', { class: 'chip chip-na' }, [`${resumo.na || 0} não se aplica`]),
      elemento('span', { class: 'chip chip-pend' }, [`${resumo.pendente || 0} não informado(s)`]),
      elemento('span', { class: 'chip chip-info' }, [`${fotos.length} foto(s)`])
    ]);

    return elemento('section', { class: 'card' }, [cabecalho, dados, contadores]);
  }

  function cartaoDocumentos() {
    return elemento('section', { class: 'card' }, [
      elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Validade de documentos'])]),
      elemento('dl', { class: 'definicoes' }, [
        elemento('div', {}, [
          elemento('dt', {}, ['CRLV']),
          elemento('dd', { class: 'validade-linha' }, [
            formatarData(checklist.crlv_validade),
            chipValidade(checklist.crlv_validade)
          ])
        ]),
        elemento('div', {}, [
          elemento('dt', {}, ['Tacógrafo']),
          elemento('dd', { class: 'validade-linha' }, [
            formatarData(checklist.tacografo_validade),
            chipValidade(checklist.tacografo_validade)
          ])
        ])
      ])
    ]);
  }

  function cartoesItens() {
    const itens = Array.isArray(checklist.itens) ? checklist.itens : [];
    if (!itens.length) return [];

    // Mantém a ordem do catálogo dentro de cada categoria conhecida.
    return CATEGORIAS
      .map(({ chave, rotulo }) => {
        const doGrupo = itens.filter((item) => item.categoria === chave);
        if (!doGrupo.length) return null;
        return elemento('section', { class: 'card' }, [
          elemento('div', { class: 'card-topo' }, [
            elemento('h2', {}, [rotulo]),
            elemento('span', { class: 'texto-pequeno texto-fraco' }, [`${doGrupo.length} item(ns)`])
          ]),
          elemento('div', {}, doGrupo.map(linhaItem))
        ]);
      })
      .filter(Boolean);
  }

  function linhaItem(item) {
    const status = item.status || 'PEND';
    const fotosDoItem = Array.isArray(item.fotos) ? item.fotos : [];

    const cabecalho = elemento('div', { class: 'item-cabecalho' }, [
      elemento('div', {}, [
        elemento('span', { class: 'item-nome' }, [item.nome || item.chave]),
        item.critico ? ' ' : null,
        item.critico ? elemento('span', { class: 'badge badge-critico' }, ['Crítico']) : null
      ]),
      elemento('span', { class: `chip chip-${status.toLowerCase()}` }, [ROTULOS[status] || status])
    ]);

    const filhos = [cabecalho];

    if (item.observacao) {
      filhos.push(elemento('p', { class: 'item-ficha-obs' }, [
        elemento('strong', { class: 'texto-fraco texto-pequeno' }, ['Observação: ']),
        item.observacao
      ]));
    }

    if (fotosDoItem.length) {
      filhos.push(elemento('div', {
        class: 'grade-fotos',
        style: { marginTop: 'var(--esp-3)' }
      }, fotosDoItem.map((foto) => miniatura(foto))));
    }

    return elemento('div', { class: 'item-checklist' }, filhos);
  }

  function cartaoLona() {
    const possui = checklist.lona_possui === true;
    const condicao = checklist.lona_condicao;

    const conteudo = [
      elemento('dl', { class: 'definicoes' }, [
        definicao('Possui lona', possui ? 'Sim' : 'Não'),
        elemento('div', {}, [
          elemento('dt', {}, ['Condição']),
          elemento('dd', {}, [
            possui && condicao
              ? elemento('span', {
                  class: `chip ${condicao === 'RUIM' ? 'chip-nc' : 'chip-ok'}`
                }, [CONDICAO_LONA[condicao] || condicao])
              : elemento('span', { class: 'texto-fraco' }, ['—'])
          ])
        ])
      ])
    ];

    if (checklist.lona_obs) {
      conteudo.push(elemento('p', {
        class: 'item-ficha-obs',
        style: { marginTop: 'var(--esp-3)' }
      }, [checklist.lona_obs]));
    }

    return elemento('section', { class: 'card' }, [
      elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Lona'])]),
      ...conteudo
    ]);
  }

  function cartaoObservacoes() {
    return elemento('section', { class: 'card' }, [
      elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Observações gerais'])]),
      checklist.obs_geral
        ? elemento('p', { style: { margin: '0', whiteSpace: 'pre-wrap' } }, [checklist.obs_geral])
        : elemento('p', { class: 'texto-fraco', style: { margin: '0' } }, ['Nenhuma observação registrada.'])
    ]);
  }

  function cartaoGaleria() {
    return elemento('section', { class: 'card' }, [
      elemento('div', { class: 'card-topo' }, [
        elemento('h2', {}, ['Fotos']),
        elemento('span', { class: 'texto-pequeno texto-fraco' }, [`${fotos.length} imagem(ns)`])
      ]),
      fotos.length
        ? elemento('div', { class: 'grade-fotos' }, fotos.map((foto) => miniatura(foto)))
        : elemento('p', { class: 'texto-fraco', style: { margin: '0' } }, ['Nenhuma foto anexada a este checklist.'])
    ]);
  }

  /** Veredito do responsável — fecha a ficha, como no formulário. */
  function cartaoDecisao() {
    const decidiu = Boolean(APROVACAO[checklist.aprovacao]);

    return elemento('section', { class: 'card' }, [
      elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Decisão final'])]),
      elemento('div', { class: 'ficha-contadores' }, [chipAprovacao(checklist.aprovacao)]),
      elemento('p', {
        class: 'texto-pequeno texto-fraco',
        style: { marginTop: 'var(--esp-3)', marginBottom: '0' }
      }, [
        decidiu
          ? `Decisão registrada por ${checklist.responsavel?.nome || 'responsável não identificado'}.`
          : 'Checklist anterior à criação deste campo: nenhuma decisão foi registrada.'
      ])
    ]);
  }

  function cartaoAssinaturas() {
    return elemento('section', { class: 'card' }, [
      elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Assinaturas'])]),
      elemento('div', { class: 'assinaturas' }, [
        elemento('div', { class: 'assinatura' }, [
          elemento('div', { class: 'assinatura-linha' }, [
            `Responsável pela inspeção — ${checklist.responsavel?.nome || ''}`
          ])
        ]),
        elemento('div', { class: 'assinatura' }, [
          elemento('div', { class: 'assinatura-linha' }, ['Conferência / Manutenção'])
        ])
      ])
    ]);
  }

  /* ---------------------------------------------------------- miniaturas */

  function miniatura(foto) {
    const indice = indicePorId.get(foto.id) ?? 0;
    const legenda = foto.legenda || '';

    return elemento('figure', {
      class: 'foto-miniatura',
      style: { margin: '0' }
    }, [
      elemento('img', {
        src: foto.url,
        alt: legenda || 'Foto do checklist',
        loading: 'lazy',
        onclick: () => abrirLightbox(indice)
      }),
      legenda ? elemento('figcaption', { class: 'foto-legenda', title: legenda }, [legenda]) : null
    ]);
  }

  /* ------------------------------------------------------------ lightbox */

  function abrirLightbox(inicial) {
    if (!fotos.length) return;
    let atual = Math.min(Math.max(inicial, 0), fotos.length - 1);

    const imagem = elemento('img', { src: fotos[atual].url, alt: '' });
    const legenda = elemento('p', {
      class: 'texto-pequeno',
      style: { margin: '0', color: '#fff', padding: 'var(--esp-3)' }
    });

    const mostrar = (indice) => {
      atual = (indice + fotos.length) % fotos.length; // navegação circular
      const foto = fotos[atual];
      imagem.src = foto.url;
      imagem.alt = foto.legenda || 'Foto do checklist';
      legenda.textContent = `${atual + 1} de ${fotos.length}${foto.legenda ? ` · ${foto.legenda}` : ''}`;
    };

    const aoTeclar = (ev) => {
      if (ev.key === 'ArrowRight') mostrar(atual + 1);
      else if (ev.key === 'ArrowLeft') mostrar(atual - 1);
    };

    const acoes = fotos.length > 1
      ? [
          elemento('button', {
            type: 'button', class: 'btn btn-secundario',
            onclick: () => mostrar(atual - 1)
          }, ['‹ Anterior']),
          elemento('button', {
            type: 'button', class: 'btn btn-secundario',
            onclick: () => mostrar(atual + 1)
          }, ['Próxima ›'])
        ]
      : [
          elemento('button', {
            type: 'button', class: 'btn btn-secundario',
            onclick: () => fecharModal()
          }, ['Fechar'])
        ];

    const caixa = abrirModal({
      titulo: 'Foto',
      corpo: elemento('div', {}, [imagem, legenda]),
      acoes,
      largo: true,
      aoFechar: () => document.removeEventListener('keydown', aoTeclar)
    });

    caixa.classList.add('modal-foto');
    document.addEventListener('keydown', aoTeclar);
    mostrar(atual);
  }

  /* ------------------------------------------------------------ exclusão */

  async function excluir() {
    const placa = checklist.veiculo?.placa || 'veículo';
    const confirmado = await confirmar(
      `Excluir o checklist de ${placa} do dia ${formatarData(checklist.data)}? Os itens e as fotos também serão removidos e a ação não pode ser desfeita.`,
      { titulo: 'Excluir checklist', textoConfirmar: 'Excluir', perigo: true }
    );
    if (!confirmado) return;

    try {
      await api.del(`/checklists/${checklist.id}`);
      toast('Checklist excluído.', 'sucesso');
      location.hash = '#/historico';
    } catch (erro) {
      toast(erro?.mensagem || 'Não foi possível excluir o checklist.', 'erro');
    }
  }
}

/* Aviso genérico para checklist inexistente ou falha de carregamento. */
function blocoAviso(titulo, mensagem) {
  return elemento('div', { class: 'vazio' }, [
    elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
    elemento('h3', {}, [titulo]),
    elemento('p', {}, [mensagem]),
    elemento('a', { class: 'btn btn-secundario', href: '#/historico' }, ['Voltar ao histórico'])
  ]);
}
