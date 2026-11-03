/**
 * util.js — formatação, criação de elementos e componentes de UI
 * (toast, modal, confirmação) compartilhados por todas as páginas.
 */

/** Rótulos em português para os status de item vindos da API. */
export const ROTULOS = {
  OK: 'Conforme',
  NC: 'Não conforme',
  NA: 'N/A',
  PEND: 'Não informado'
};

/** Rótulos do status calculado do checklist. */
export const ROTULO_STATUS = {
  APROVADO: 'Aprovado',
  RESTRICAO: 'Aprovado com restrição',
  REPROVADO: 'Reprovado'
};

/* --------------------------------------------------------------------------
   Datas e números
   -------------------------------------------------------------------------- */

/**
 * Converte 'AAAA-MM-DD' (ou ISO completo) em 'DD/MM/AAAA'.
 * Fatiamos a string em vez de usar Date para não sofrer deslocamento de fuso.
 */
export function formatarData(iso) {
  if (!iso) return '—';
  const texto = String(iso).trim();
  const casa = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!casa) return texto;
  return `${casa[3]}/${casa[2]}/${casa[1]}`;
}

/** 'AAAA-MM-DD HH:MM:SS' ou ISO → 'DD/MM/AAAA HH:MM'. */
export function formatarDataHora(iso) {
  if (!iso) return '—';
  const texto = String(iso).trim();
  const data = formatarData(texto);
  const hora = texto.match(/[T ](\d{2}):(\d{2})/);
  return hora ? `${data} ${hora[1]}:${hora[2]}` : data;
}

/** Data local de hoje em 'AAAA-MM-DD' (formato aceito por input[type=date]). */
export function hoje() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Hora local atual em 'HH:MM'. */
export function agoraHora() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Número no padrão pt-BR (separador de milhar por ponto). */
export function formatarNumero(valor, casas = 0) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

/** Adia a execução até parar de ser chamada — usado nos campos de busca. */
export function debounce(fn, espera = 300) {
  let temporizador;
  return function (...args) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn.apply(this, args), espera);
  };
}

/** Escapa HTML antes de interpolar texto vindo do banco. */
export function escapar(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* --------------------------------------------------------------------------
   Criação de elementos
   -------------------------------------------------------------------------- */

/**
 * elemento('button', { class:'btn', onclick: fn }, ['Salvar'])
 * props especiais: class, dataset, style (objeto), on<evento> (função),
 * html (innerHTML já confiável). Filhos aceitam string, Node, array ou null.
 */
export function elemento(tag, props = {}, filhos = []) {
  const el = document.createElement(tag);

  for (const [chave, valor] of Object.entries(props || {})) {
    if (valor === null || valor === undefined || valor === false) continue;

    if (chave === 'class' || chave === 'className') {
      el.className = valor;
    } else if (chave === 'dataset') {
      Object.assign(el.dataset, valor);
    } else if (chave === 'style' && typeof valor === 'object') {
      Object.assign(el.style, valor);
    } else if (chave === 'html') {
      el.innerHTML = valor;
    } else if (chave === 'texto') {
      el.textContent = valor;
    } else if (chave.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(chave.slice(2).toLowerCase(), valor);
    } else if (valor === true) {
      el.setAttribute(chave, '');
    } else {
      el.setAttribute(chave, String(valor));
    }
  }

  anexar(el, filhos);
  return el;
}

function anexar(pai, filhos) {
  const lista = Array.isArray(filhos) ? filhos : [filhos];
  for (const filho of lista) {
    if (filho === null || filho === undefined || filho === false) continue;
    if (Array.isArray(filho)) anexar(pai, filho);
    else if (filho instanceof Node) pai.appendChild(filho);
    else pai.appendChild(document.createTextNode(String(filho)));
  }
}

/* --------------------------------------------------------------------------
   Spinner e estado vazio
   -------------------------------------------------------------------------- */

/** Bloco de carregamento; se receber um container, já o substitui. */
export function spinner(container, mensagem = 'Carregando…') {
  const bloco = elemento('div', { class: 'carregando' }, [
    elemento('div', { class: 'spinner spinner-grande', role: 'status', 'aria-label': mensagem }),
    elemento('span', {}, [mensagem])
  ]);
  if (container) {
    container.replaceChildren(bloco);
  }
  return bloco;
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

function areaToasts() {
  let area = document.getElementById('toasts');
  if (!area) {
    area = elemento('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(area);
  }
  return area;
}

/** tipo: 'sucesso' | 'erro' | 'alerta' | 'info'. */
export function toast(msg, tipo = 'info', duracao = 3800) {
  const area = areaToasts();
  const item = elemento('div', { class: `toast toast-${tipo}` }, [String(msg)]);
  area.appendChild(item);

  // Erros ficam mais tempo na tela porque costumam exigir leitura.
  const tempo = tipo === 'erro' ? Math.max(duracao, 5200) : duracao;
  const sair = () => {
    item.classList.add('saindo');
    item.addEventListener('animationend', () => item.remove(), { once: true });
  };
  const relogio = setTimeout(sair, tempo);
  item.addEventListener('click', () => {
    clearTimeout(relogio);
    sair();
  });
  return item;
}

/* --------------------------------------------------------------------------
   Modal
   -------------------------------------------------------------------------- */

let modalAtivo = null;

function fundoModal() {
  let fundo = document.getElementById('modal-fundo');
  if (!fundo) {
    fundo = elemento('div', { id: 'modal-fundo', class: 'modal-fundo', hidden: true });
    document.body.appendChild(fundo);
  }
  return fundo;
}

function aoTeclar(evento) {
  if (evento.key === 'Escape') fecharModal();
}

/**
 * abrirModal({ titulo, corpo, acoes, largo, aoFechar })
 * - corpo: Node ou string
 * - acoes: array de Node (botões do rodapé)
 * Devolve o elemento .modal para quem precisar manipular o conteúdo.
 */
export function abrirModal({ titulo = '', corpo = null, acoes = [], largo = false, aoFechar = null } = {}) {
  fecharModal();

  const fundo = fundoModal();
  const caixa = elemento('div', {
    class: `modal${largo ? ' modal-largo' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': titulo || 'Janela'
  });

  if (titulo) {
    caixa.appendChild(elemento('div', { class: 'modal-cabecalho' }, [
      elemento('h2', {}, [titulo]),
      elemento('button', {
        type: 'button',
        class: 'btn-icone',
        'aria-label': 'Fechar',
        onclick: () => fecharModal()
      }, ['✕'])
    ]));
  }

  const corpoEl = elemento('div', { class: 'modal-corpo' });
  if (typeof corpo === 'string') corpoEl.appendChild(elemento('p', {}, [corpo]));
  else if (corpo) corpoEl.appendChild(corpo);
  caixa.appendChild(corpoEl);

  if (acoes && acoes.length) {
    caixa.appendChild(elemento('div', { class: 'modal-rodape' }, acoes));
  }

  fundo.replaceChildren(caixa);
  fundo.hidden = false;
  document.body.style.overflow = 'hidden';

  // Clicar fora fecha; clicar dentro não deve propagar para o fundo.
  fundo.onclick = (ev) => { if (ev.target === fundo) fecharModal(); };
  document.addEventListener('keydown', aoTeclar);

  modalAtivo = { caixa, aoFechar };

  const focavel = caixa.querySelector('input, select, textarea, button');
  if (focavel) focavel.focus();

  return caixa;
}

export function fecharModal() {
  const fundo = document.getElementById('modal-fundo');
  if (!fundo || fundo.hidden) return;

  fundo.hidden = true;
  fundo.replaceChildren();
  fundo.onclick = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', aoTeclar);

  const anterior = modalAtivo;
  modalAtivo = null;
  if (anterior?.aoFechar) anterior.aoFechar();
}

/**
 * Confirmação com modal próprio (window.confirm bloqueia a thread e
 * não segue o visual do sistema). Resolve true/false.
 */
export function confirmar(msg, opcoes = {}) {
  const {
    titulo = 'Confirmar',
    textoConfirmar = 'Confirmar',
    textoCancelar = 'Cancelar',
    perigo = false
  } = opcoes;

  return new Promise((resolver) => {
    let respondido = false;
    const responder = (valor) => {
      if (respondido) return;
      respondido = true;
      resolver(valor);
      fecharModal();
    };

    const botaoCancelar = elemento('button', {
      type: 'button',
      class: 'btn btn-secundario',
      onclick: () => responder(false)
    }, [textoCancelar]);

    const botaoConfirmar = elemento('button', {
      type: 'button',
      class: `btn ${perigo ? 'btn-perigo' : 'btn-primario'}`,
      onclick: () => responder(true)
    }, [textoConfirmar]);

    abrirModal({
      titulo,
      corpo: String(msg),
      acoes: [botaoCancelar, botaoConfirmar],
      // Fechar pelo Esc ou clicando fora equivale a cancelar.
      aoFechar: () => responder(false)
    });

    botaoConfirmar.focus();
  });
}
