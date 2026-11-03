/**
 * api.js — cliente HTTP do painel.
 * Concentra token, cabeçalhos e tradução de erros num único lugar,
 * para nenhuma página precisar mexer em fetch diretamente.
 */

const CHAVE_TOKEN = 'checklist_token';
const CHAVE_USUARIO = 'checklist_usuario';

// Mesma origem do frontend: a API é servida pelo próprio Express.
const baseUrl = '/api';

/** Mensagens amigáveis quando o servidor não manda texto útil. */
const MENSAGENS_PADRAO = {
  VALIDACAO: 'Dados inválidos. Confira os campos destacados.',
  NAO_AUTENTICADO: 'Sessão expirada. Entre novamente.',
  SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
  NAO_ENCONTRADO: 'Registro não encontrado.',
  CONFLITO: 'Já existe um registro com estes dados.',
  PAYLOAD_GRANDE: 'Arquivo muito grande. Reduza o tamanho da foto.',
  ERRO_INTERNO: 'Falha no servidor. Tente novamente em instantes.',
  REDE: 'Sem conexão com o servidor. Verifique a rede.'
};

/** Erro de API com código e campos, para o formulário destacar cada campo. */
function criarErro(codigo, mensagem, campos, status) {
  const erro = new Error(mensagem || MENSAGENS_PADRAO[codigo] || 'Erro inesperado.');
  erro.codigo = codigo || 'ERRO_INTERNO';
  erro.mensagem = erro.message;
  erro.campos = campos || null;
  erro.status = status || 0;
  return erro;
}

function lerToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

function usuarioAtual() {
  const bruto = localStorage.getItem(CHAVE_USUARIO);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch {
    // Dado corrompido no storage não pode derrubar a aplicação.
    localStorage.removeItem(CHAVE_USUARIO);
    return null;
  }
}

function autenticado() {
  return Boolean(lerToken());
}

function guardarSessao(token, usuario) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

function limparSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
}

/** Acrescenta a query string ignorando valores vazios/nulos. */
function comQuery(caminho, params) {
  if (!params) return caminho;
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  return texto ? `${caminho}${caminho.includes('?') ? '&' : '?'}${texto}` : caminho;
}

/**
 * Requisição base. Devolve { dados, paginacao } quando há paginação,
 * senão apenas os dados — é o formato que as páginas esperam.
 */
async function requisitar(metodo, caminho, corpo, opcoes = {}) {
  const cabecalhos = { Accept: 'application/json' };
  const token = lerToken();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

  let resposta;
  try {
    resposta = await fetch(baseUrl + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: opcoes.signal
    });
  } catch {
    throw criarErro('REDE', MENSAGENS_PADRAO.REDE);
  }

  // 401 encerra a sessão em qualquer ponto do app, não só no login.
  if (resposta.status === 401) {
    limparSessao();
    window.dispatchEvent(new CustomEvent('sessao-expirada'));
    throw criarErro('NAO_AUTENTICADO', MENSAGENS_PADRAO.NAO_AUTENTICADO, null, 401);
  }

  if (resposta.status === 204) return null;

  const tipo = resposta.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) {
    if (resposta.ok) return await resposta.text();
    throw criarErro('ERRO_INTERNO', MENSAGENS_PADRAO.ERRO_INTERNO, null, resposta.status);
  }

  let corpoResposta;
  try {
    corpoResposta = await resposta.json();
  } catch {
    throw criarErro('ERRO_INTERNO', MENSAGENS_PADRAO.ERRO_INTERNO, null, resposta.status);
  }

  if (!resposta.ok || corpoResposta?.ok === false) {
    const erro = corpoResposta?.erro || {};
    throw criarErro(erro.codigo, erro.mensagem, erro.campos, resposta.status);
  }

  if (corpoResposta && corpoResposta.paginacao) {
    return { dados: corpoResposta.dados, paginacao: corpoResposta.paginacao };
  }
  return corpoResposta ? corpoResposta.dados : null;
}

const get = (caminho, params, opcoes) => requisitar('GET', comQuery(caminho, params), undefined, opcoes);
const post = (caminho, corpo, opcoes) => requisitar('POST', caminho, corpo ?? {}, opcoes);
const put = (caminho, corpo, opcoes) => requisitar('PUT', caminho, corpo ?? {}, opcoes);
const del = (caminho, opcoes) => requisitar('DELETE', caminho, undefined, opcoes);

/** Autentica e já persiste a sessão. */
async function login(email, senha) {
  const dados = await requisitar('POST', '/auth/login', { email, senha });
  guardarSessao(dados.token, dados.usuario);
  return dados.usuario;
}

/** Regrava o usuário da sessão (ex.: após deixar de ter senha provisória). */
function atualizarUsuario(usuario) {
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  return usuario;
}

/** Sai localmente: o token é stateless, basta descartá-lo. */
function logout() {
  limparSessao();
}

export const api = {
  get,
  post,
  put,
  del,
  login,
  logout,
  usuarioAtual,
  atualizarUsuario,
  autenticado,
  baseUrl
};

export default api;
