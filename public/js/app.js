/**
 * app.js — bootstrap da SPA: sessão, login, navegação por hash
 * e carregamento sob demanda das páginas.
 */

import { api } from './api.js';
import { elemento, spinner, toast, fecharModal } from './util.js';

/* --------------------------------------------------------------------------
   Tabela de rotas
   'modulo' é carregado com import() só quando a rota é acessada — assim o
   celular não baixa o app inteiro para abrir uma única tela.
   -------------------------------------------------------------------------- */
const ROTAS = [
  { padrao: /^\/$/,                modulo: () => import('./paginas/dashboard.js'),  titulo: 'Início',          nav: '/' },
  { padrao: /^\/novo$/,            modulo: () => import('./paginas/checklist.js'),  titulo: 'Novo checklist',  nav: '/novo' },
  { padrao: /^\/historico$/,       modulo: () => import('./paginas/historico.js'),  titulo: 'Histórico',       nav: '/historico' },
  { padrao: /^\/historico\/(\d+)$/, modulo: () => import('./paginas/detalhe.js'),   titulo: 'Checklist',       nav: '/historico', params: ['id'] },
  // Mesma tela do "novo": com :id ela entra em modo de edição.
  { padrao: /^\/historico\/(\d+)\/editar$/, modulo: () => import('./paginas/checklist.js'), titulo: 'Editar checklist', nav: '/historico', params: ['id'] },
  { padrao: /^\/veiculos$/,        modulo: () => import('./paginas/veiculos.js'),   titulo: 'Veículos',        nav: '/veiculos' },
  { padrao: /^\/relatorios$/,      modulo: () => import('./paginas/relatorios.js'), titulo: 'Relatórios',      nav: '/relatorios' },
  { padrao: /^\/usuarios$/,        modulo: () => import('./paginas/usuarios.js'),   titulo: 'Usuários',        nav: '/usuarios', perfil: 'admin' },
  { padrao: /^\/auditoria$/,       modulo: () => import('./paginas/auditoria.js'),  titulo: 'Auditoria',       nav: '/auditoria', perfil: 'admin' }
];

const TITULO_BASE = 'Checklist de Caminhões';

/* Elementos do shell (existem em index.html). */
const telaLogin = document.getElementById('tela-login');
const app = document.getElementById('app');
const conteudo = document.getElementById('conteudo');
const navegacao = document.getElementById('navegacao');
const formLogin = document.getElementById('form-login');
const loginErro = document.getElementById('login-erro');
const btnEntrar = document.getElementById('btn-entrar');
const btnSair = document.getElementById('btn-sair');
const btnMenu = document.getElementById('btn-menu');

/* Sequência de renderização: descarta resultado de navegação superada. */
let renderizacaoAtual = 0;

/* --------------------------------------------------------------------------
   Login
   -------------------------------------------------------------------------- */

function mostrarLogin() {
  fecharModal();
  app.hidden = true;
  telaLogin.hidden = false;
  loginErro.hidden = true;
  loginErro.textContent = '';
  formLogin.reset();
  document.title = `Entrar · ${TITULO_BASE}`;
  document.getElementById('login-email')?.focus();
}

function mostrarApp() {
  telaLogin.hidden = true;
  app.hidden = false;
  aplicarUsuario();
  rotear();
}

async function aoEnviarLogin(evento) {
  evento.preventDefault();
  loginErro.hidden = true;

  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;

  if (!email || !senha) {
    mostrarErroLogin('Informe e-mail e senha.');
    return;
  }

  btnEntrar.disabled = true;
  const rotuloOriginal = btnEntrar.textContent;
  btnEntrar.textContent = 'Entrando…';

  try {
    const usuario = await api.login(email, senha);
    // Sem hash definido, cai no painel inicial.
    if (!location.hash || location.hash === '#/') location.hash = '#/';
    mostrarApp();
    toast(`Bem-vindo(a), ${usuario.nome}.`, 'sucesso');
  } catch (erro) {
    mostrarErroLogin(
      erro.codigo === 'NAO_AUTENTICADO'
        ? 'E-mail ou senha inválidos.'
        : erro.mensagem || 'Não foi possível entrar.'
    );
  } finally {
    btnEntrar.disabled = false;
    btnEntrar.textContent = rotuloOriginal;
  }
}

function mostrarErroLogin(mensagem) {
  loginErro.textContent = mensagem;
  loginErro.hidden = false;
}

function sair() {
  api.logout();
  location.hash = '#/';
  mostrarLogin();
}

/* --------------------------------------------------------------------------
   Cabeçalho e menu
   -------------------------------------------------------------------------- */

/** Reflete no cabeçalho o usuário da sessão e libera o menu de admin. */
function aplicarUsuario() {
  const usuario = api.usuarioAtual();
  if (!usuario) return;

  document.getElementById('usuario-nome').textContent = usuario.nome || '—';

  const perfil = document.getElementById('usuario-perfil');
  perfil.textContent = usuario.perfil === 'admin' ? 'Administrador' : 'Operador';

  // "Usuários" é exclusivo do admin — a API também barra, isto é só a UI.
  document.querySelectorAll('.nav-admin').forEach((link) => {
    link.hidden = usuario.perfil !== 'admin';
  });
}

function alternarMenu(forcar) {
  const abrir = forcar ?? !navegacao.classList.contains('aberto');
  navegacao.classList.toggle('aberto', abrir);
  btnMenu.setAttribute('aria-expanded', String(abrir));
}

function marcarNavAtiva(nav) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('ativo', link.dataset.rota === nav);
  });
}

/* --------------------------------------------------------------------------
   Roteador por hash
   -------------------------------------------------------------------------- */

function caminhoAtual() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash || hash === '/') return '/';
  return hash.split('?')[0].replace(/\/+$/, '') || '/';
}

function encontrarRota(caminho) {
  for (const rota of ROTAS) {
    const casa = caminho.match(rota.padrao);
    if (!casa) continue;
    const params = {};
    (rota.params || []).forEach((nome, indice) => { params[nome] = casa[indice + 1]; });
    return { rota, params };
  }
  return null;
}

function paginaErro(titulo, mensagem) {
  return elemento('div', { class: 'vazio' }, [
    elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
    elemento('h3', {}, [titulo]),
    elemento('p', {}, [mensagem]),
    elemento('a', { class: 'btn btn-secundario', href: '#/' }, ['Voltar ao início'])
  ]);
}

/** Campo de senha simples, no mesmo formato usado pelas páginas. */
function campoSenha(id, rotulo, autocomplete, dica) {
  const entrada = elemento('input', { id, name: id, type: 'password', autocomplete });

  return {
    entrada,
    el: elemento('div', { class: 'campo col-cheia' }, [
      elemento('label', { for: id }, [rotulo]),
      entrada,
      dica ? elemento('span', { class: 'campo-dica' }, [dica]) : null
    ])
  };
}

/**
 * Troca obrigatória da senha provisória criada pela carga inicial.
 * Sem concluí-la a API recusa todas as outras rotas (403 SENHA_PROVISORIA).
 */
function painelSenhaProvisoria() {
  const atual = campoSenha('provisoria-atual', 'Senha provisória *', 'current-password');
  const nova = campoSenha(
    'provisoria-nova', 'Nova senha *', 'new-password', 'Mínimo de 6 caracteres.'
  );
  const repetir = campoSenha('provisoria-repetir', 'Repita a nova senha *', 'new-password');

  const erro = elemento('p', { class: 'campo-erro col-cheia', hidden: true });
  const botao = elemento('button', { type: 'submit', class: 'btn btn-primario' }, [
    'Definir nova senha'
  ]);

  const form = elemento('form', { class: 'form-grade', novalidate: true }, [
    atual.el,
    nova.el,
    repetir.el,
    erro,
    elemento('div', { class: 'barra-acoes col-cheia' }, [botao])
  ]);

  function falhar(mensagem, campo) {
    erro.textContent = mensagem;
    erro.hidden = false;
    campo?.entrada.focus();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;

    const senhaAtual = atual.entrada.value;
    const senhaNova = nova.entrada.value;

    if (!senhaAtual) return falhar('Informe a senha provisória que você recebeu.', atual);
    if (senhaNova.length < 6) return falhar('A nova senha deve ter no mínimo 6 caracteres.', nova);
    if (senhaNova === senhaAtual) return falhar('A nova senha deve ser diferente da provisória.', nova);
    if (senhaNova !== repetir.entrada.value) return falhar('As senhas não conferem.', repetir);

    botao.disabled = true;
    botao.textContent = 'Salvando…';

    try {
      await api.post('/auth/senha', { senhaAtual, senhaNova });
      // Recarrega o usuário: o servidor já não o marca como provisório.
      api.atualizarUsuario(await api.get('/auth/eu'));
      toast('Senha definida. Bem-vindo(a) ao sistema.', 'sucesso');
      aplicarUsuario();
      rotear();
    } catch (falha) {
      falhar(falha.mensagem || 'Não foi possível alterar a senha.', atual);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Definir nova senha';
    }
  });

  queueMicrotask(() => atual.entrada.focus());

  return elemento('section', { class: 'card' }, [
    elemento('div', { class: 'card-topo' }, [elemento('h2', {}, ['Troque a senha provisória'])]),
    elemento('p', { class: 'texto-fraco' }, [
      'Sua conta ainda usa a senha provisória gerada na instalação. ' +
        'Defina uma senha pessoal para liberar o restante do sistema.'
    ]),
    form
  ]);
}

async function rotear() {
  if (!api.autenticado()) {
    mostrarLogin();
    return;
  }

  fecharModal();
  alternarMenu(false);

  // Senha provisória: a API bloqueia todo o resto, então o painel só mostra
  // a troca de senha até ela ser concluída.
  if (api.usuarioAtual()?.senhaProvisoria) {
    marcarNavAtiva(null);
    document.title = `Trocar senha · ${TITULO_BASE}`;
    conteudo.replaceChildren(painelSenhaProvisoria());
    return;
  }

  const caminho = caminhoAtual();
  const achado = encontrarRota(caminho);

  if (!achado) {
    conteudo.replaceChildren(
      paginaErro('Página não encontrada', 'O endereço acessado não existe neste painel.')
    );
    marcarNavAtiva(null);
    return;
  }

  const { rota, params } = achado;
  const usuario = api.usuarioAtual();

  if (rota.perfil && usuario?.perfil !== rota.perfil) {
    conteudo.replaceChildren(
      paginaErro('Acesso restrito', 'Esta área é exclusiva de administradores.')
    );
    marcarNavAtiva(null);
    return;
  }

  marcarNavAtiva(rota.nav);
  document.title = `${rota.titulo} · ${TITULO_BASE}`;

  const sequencia = ++renderizacaoAtual;
  spinner(conteudo);

  try {
    const modulo = await rota.modulo();
    if (sequencia !== renderizacaoAtual) return; // navegou de novo enquanto carregava

    conteudo.replaceChildren();
    await modulo.default(conteudo, params);

    if (sequencia === renderizacaoAtual) {
      conteudo.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  } catch (erro) {
    if (sequencia !== renderizacaoAtual) return;
    // 401 já disparou 'sessao-expirada'; não sobrepor a tela de login.
    if (erro?.codigo === 'NAO_AUTENTICADO') return;

    console.error('Falha ao abrir a página:', erro);
    conteudo.replaceChildren(
      paginaErro('Não foi possível carregar', erro?.mensagem || 'Tente novamente em instantes.')
    );
  }
}

/* --------------------------------------------------------------------------
   Inicialização
   -------------------------------------------------------------------------- */

function iniciar() {
  formLogin.addEventListener('submit', aoEnviarLogin);
  btnSair.addEventListener('click', sair);
  btnMenu.addEventListener('click', () => alternarMenu());

  // Navegar pelo menu fecha o painel recolhido no celular.
  navegacao.addEventListener('click', (ev) => {
    if (ev.target.closest('.nav-link')) alternarMenu(false);
  });

  window.addEventListener('hashchange', rotear);

  // Token recusado em qualquer requisição derruba a sessão imediatamente.
  window.addEventListener('sessao-expirada', () => {
    mostrarLogin();
    mostrarErroLogin('Sua sessão expirou. Entre novamente.');
  });

  if (api.autenticado()) mostrarApp();
  else mostrarLogin();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar, { once: true });
} else {
  iniciar();
}
