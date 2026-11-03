/**
 * componentes/fotos.js — seletor de fotos do checklist.
 *
 * Serve tanto para a linha de um item (botão de câmera) quanto para a
 * galeria geral do checklist. As imagens são comprimidas no próprio
 * aparelho antes de virar base64: uma foto de celular tem 3–8 MB e o
 * envio é feito dentro do JSON do checklist — sem compressão o payload
 * estouraria o limite do servidor e a rede do pátio.
 */

import { elemento, toast, abrirModal } from '../util.js';

/** Maior lado da imagem depois de redimensionada (px). */
const LADO_MAXIMO = 1600;
/** Qualidade do JPEG gerado — bom equilíbrio entre leitura e tamanho. */
const QUALIDADE = 0.75;
/** Limite padrão de fotos, espelha MAX_FOTOS_CHECKLIST do servidor. */
const MAX_PADRAO = 20;
/** Limite por foto (MAX_FOTO_MB do servidor), em bytes decodificados. */
const MAX_BYTES = 5 * 1024 * 1024;

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

/* --------------------------------------------------------------------------
   Estilos próprios do componente
   O design system já traz .grade-fotos/.foto-miniatura/.foto-adicionar;
   aqui só entra o que é exclusivo do modo de edição (campo de legenda).
   -------------------------------------------------------------------------- */
function garantirEstilo() {
  if (document.getElementById('estilo-componente-fotos')) return;
  const estilo = elemento('style', { id: 'estilo-componente-fotos' }, [`
    .fotos-seletor { display: grid; gap: var(--esp-2); }
    .fotos-celula { display: grid; gap: var(--esp-1); align-content: start; min-width: 0; }
    .fotos-celula .foto-miniatura { width: 100%; }
    .fotos-legenda-campo {
      min-height: 36px;
      padding: var(--esp-1) var(--esp-2);
      border-radius: var(--raio-sm);
      font-size: 16px;
    }
    .fotos-rodape { display: flex; flex-wrap: wrap; gap: var(--esp-2); align-items: center; margin: 0; }
    .foto-adicionar[disabled] { opacity: .6; cursor: progress; }
  `]);
  document.head.appendChild(estilo);
}

/* --------------------------------------------------------------------------
   Leitura e compressão
   -------------------------------------------------------------------------- */

/**
 * Carrega o arquivo já com a orientação EXIF aplicada.
 * Fotos tiradas na vertical vêm deitadas se a orientação for ignorada.
 */
async function carregarImagem(arquivo) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    } catch {
      // Navegador sem suporte à opção: cai no leitor tradicional.
    }
  }

  const dataUrl = await lerComoDataUrl(arquivo);
  return await new Promise((resolver, rejeitar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rejeitar(new Error('Imagem inválida'));
    img.src = dataUrl;
  });
}

function lerComoDataUrl(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(new Error('Falha na leitura do arquivo'));
    leitor.readAsDataURL(arquivo);
  });
}

/** Tamanho real (bytes) do conteúdo de uma data URL base64. */
function tamanhoDeDataUrl(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const preenchimento = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - preenchimento);
}

/** Redimensiona para no máximo LADO_MAXIMO no maior lado e exporta JPEG. */
async function comprimir(arquivo) {
  const fonte = await carregarImagem(arquivo);
  const largura = fonte.width || fonte.naturalWidth;
  const altura = fonte.height || fonte.naturalHeight;

  if (!largura || !altura) throw new Error('Imagem sem dimensões');

  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largura * escala));
  canvas.height = Math.max(1, Math.round(altura * escala));

  const contexto = canvas.getContext('2d');
  // PNG/WebP com transparência viraria preto no JPEG: pintamos o fundo antes.
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, canvas.width, canvas.height);
  contexto.drawImage(fonte, 0, 0, canvas.width, canvas.height);

  if (typeof fonte.close === 'function') fonte.close(); // libera o ImageBitmap

  const dados = canvas.toDataURL('image/jpeg', QUALIDADE);
  if (!dados.startsWith('data:image/jpeg')) throw new Error('Falha ao converter a imagem');

  return { dados, tamanho: tamanhoDeDataUrl(dados) };
}

/* --------------------------------------------------------------------------
   Visualizador (lightbox)
   -------------------------------------------------------------------------- */
function ampliar(foto) {
  const imagem = elemento('img', {
    src: foto.dados,
    alt: foto.legenda || foto.nome || 'Foto do checklist'
  });
  const caixa = abrirModal({
    titulo: foto.legenda || foto.nome || 'Foto',
    corpo: imagem,
    largo: true
  });
  caixa.classList.add('modal-foto');
}

/* --------------------------------------------------------------------------
   Componente
   -------------------------------------------------------------------------- */

/**
 * seletorDeFotos({ aoMudar, max, itemChave, rotulo })
 *  - aoMudar: chamado a cada inclusão/remoção (recebe o array de fotos)
 *  - max: número ou função que devolve o limite atual (permite dividir uma
 *         cota global entre vários seletores da mesma tela)
 *  - itemChave: grava item_chave em cada foto (null = galeria geral)
 *
 * Devolve { elemento, fotos, limpar, adicionarArquivos }.
 * `fotos` é sempre o mesmo array (mutado no lugar) — quem chama pode guardá-lo.
 */
export function seletorDeFotos({ aoMudar = null, max = MAX_PADRAO, itemChave = null, rotulo = 'Adicionar foto' } = {}) {
  garantirEstilo();

  const fotos = [];
  let processando = false;

  const entrada = elemento('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment', // no celular abre a câmera; no PC, o seletor de arquivos
    multiple: true,
    class: 'sr-apenas',
    tabindex: '-1',
    'aria-hidden': 'true'
  });

  const grade = elemento('div', { class: 'grade-fotos' });
  const rodape = elemento('p', { class: 'texto-pequeno texto-fraco fotos-rodape' });
  const raiz = elemento('div', { class: 'fotos-seletor' }, [grade, rodape, entrada]);

  function limiteAtual() {
    const bruto = typeof max === 'function' ? max() : max;
    const numero = Number(bruto);
    if (!Number.isFinite(numero) || numero < 0) return MAX_PADRAO;
    return Math.floor(numero);
  }

  function notificar() {
    if (typeof aoMudar === 'function') aoMudar(fotos);
  }

  function remover(indice) {
    fotos.splice(indice, 1);
    desenhar();
    notificar();
  }

  function botaoAdicionar() {
    const botao = elemento('button', {
      type: 'button',
      class: 'foto-adicionar',
      disabled: processando,
      'aria-label': itemChave ? `Adicionar foto do item ${itemChave}` : 'Adicionar foto ao checklist',
      onclick: () => entrada.click()
    }, [
      elemento('span', { 'aria-hidden': 'true' }, [processando ? '⏳' : '📷']),
      elemento('span', {}, [processando ? 'Processando…' : rotulo])
    ]);
    return botao;
  }

  function celula(foto, indice) {
    const imagem = elemento('img', {
      src: foto.dados,
      alt: foto.legenda || `Foto ${indice + 1}`,
      loading: 'lazy',
      onclick: () => ampliar(foto)
    });

    const miniatura = elemento('div', { class: 'foto-miniatura' }, [
      imagem,
      elemento('button', {
        type: 'button',
        class: 'foto-remover',
        'aria-label': `Remover foto ${indice + 1}`,
        onclick: () => remover(indice)
      }, ['✕'])
    ]);

    const legenda = elemento('input', {
      type: 'text',
      class: 'fotos-legenda-campo',
      value: foto.legenda,
      maxlength: '120',
      placeholder: 'Legenda',
      'aria-label': `Legenda da foto ${indice + 1}`
    });
    // Atualiza direto no objeto: redesenhar aqui tiraria o foco do campo.
    legenda.addEventListener('input', () => { foto.legenda = legenda.value; });

    return elemento('div', { class: 'fotos-celula' }, [miniatura, legenda]);
  }

  function desenhar() {
    grade.replaceChildren(...fotos.map(celula), botaoAdicionar());

    const limite = limiteAtual();
    const total = fotos.length;
    rodape.textContent = total === 0
      ? 'Nenhuma foto anexada.'
      : `${total} ${total === 1 ? 'foto anexada' : 'fotos anexadas'} (limite de ${limite}).`;
  }

  function ocupado(valor) {
    processando = valor;
    desenhar();
  }

  /** Aceita FileList ou array de File. */
  async function adicionarArquivos(lista) {
    const arquivos = Array.from(lista || []);
    if (!arquivos.length) return;

    const imagens = arquivos.filter((a) => a && typeof a.type === 'string' && a.type.startsWith('image/'));
    if (imagens.length < arquivos.length) {
      toast('Apenas arquivos de imagem podem ser anexados.', 'alerta');
    }
    if (!imagens.length) return;

    const limite = limiteAtual();
    const espaco = Math.max(0, limite - fotos.length);
    if (espaco === 0) {
      toast(`Limite de ${limite} ${limite === 1 ? 'foto' : 'fotos'} atingido. Remova alguma para anexar outra.`, 'alerta');
      return;
    }

    const aceitos = imagens.slice(0, espaco);
    if (aceitos.length < imagens.length) {
      toast(`Só foi possível anexar ${aceitos.length} de ${imagens.length} fotos: o limite é de ${limite}.`, 'alerta');
    }

    ocupado(true);
    try {
      for (const arquivo of aceitos) {
        const nome = arquivo.name || 'foto.jpg';
        try {
          // Tipos exóticos (heic, por exemplo) só falham na decodificação;
          // o canvas devolve JPEG, então o formato de origem não limita o envio.
          if (arquivo.type && !TIPOS_ACEITOS.includes(arquivo.type) && !arquivo.type.startsWith('image/')) {
            throw new Error('Tipo não suportado');
          }
          const { dados, tamanho } = await comprimir(arquivo);
          if (tamanho > MAX_BYTES) {
            toast(`"${nome}" continua grande demais mesmo após a compressão.`, 'erro');
            continue;
          }
          fotos.push({ dados, legenda: '', item_chave: itemChave, nome, tamanho });
        } catch {
          toast(`Não foi possível processar "${nome}". Tente outra imagem.`, 'erro');
        }
      }
    } finally {
      ocupado(false);
    }

    notificar();
  }

  entrada.addEventListener('change', async () => {
    const selecionados = entrada.files;
    // Zera antes de processar para permitir reenviar o mesmo arquivo depois.
    await adicionarArquivos(selecionados);
    entrada.value = '';
  });

  function limpar() {
    fotos.length = 0;
    desenhar();
    notificar();
  }

  desenhar();

  return { elemento: raiz, fotos, limpar, adicionarArquivos };
}

export default seletorDeFotos;
