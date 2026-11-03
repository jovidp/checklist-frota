/**
 * paginas/usuarios.js — gestão de usuários (tela exclusiva de administrador)
 * e bloco "Minha conta" para o próprio usuário trocar a senha.
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

const SENHA_MINIMA = 6;

// Limite alto porque a lista é filtrada no cliente: uma frota tem
// dezenas de usuários, não milhares — evita paginar uma tela pequena.
const LIMITE_BUSCA = 100;

const ROTULO_PERFIL = { admin: 'Administrador', operador: 'Operador' };

/* Estilo próprio da tela: apenas o esmaecimento da linha desativada. */
function garantirEstilo() {
  if (document.getElementById('estilo-usuarios')) return;
  document.head.appendChild(
    elemento('style', { id: 'estilo-usuarios' }, [
      '.linha-inativa td { opacity: .62; }',
      '.usuario-identidade { display: flex; flex-direction: column; gap: 2px; }'
    ])
  );
}

/* --------------------------------------------------------------------------
   Campos de formulário
   -------------------------------------------------------------------------- */

/** Campo com rótulo, dica e área de erro reutilizado por todos os modais. */
function criarCampo({
  nome,
  rotulo,
  tipo = 'text',
  valor = '',
  dica = '',
  cheia = false,
  opcoes = null,
  atributos = {}
}) {
  const id = `usuario-${nome}-${Math.random().toString(36).slice(2, 8)}`;

  const entrada = opcoes
    ? elemento(
        'select',
        { id, name: nome, ...atributos },
        opcoes.map((opcao) => elemento('option', { value: opcao.valor }, [opcao.rotulo]))
      )
    : elemento('input', { id, name: nome, type: tipo, ...atributos });

  entrada.value = valor === null || valor === undefined ? '' : String(valor);

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
    get bruto() {
      return entrada.value;
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

/** Validação de e-mail no cliente; o servidor revalida de qualquer forma. */
function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
}

/* --------------------------------------------------------------------------
   Página
   -------------------------------------------------------------------------- */

export default async function render(container, params) {
  garantirEstilo();

  const eu = api.usuarioAtual();

  const estado = {
    todos: [],
    busca: '',
    perfil: '',
    situacao: '',
    requisicao: 0
  };

  /* ---------- Estrutura fixa ---------- */

  const topo = elemento('div', { class: 'pagina-topo' }, [
    elemento('div', {}, [
      elemento('h1', {}, ['Usuários']),
      elemento('p', { class: 'pagina-sub' }, [
        'Controle quem acessa o sistema e com qual perfil.'
      ])
    ]),
    elemento(
      'button',
      { type: 'button', class: 'btn btn-primario', onclick: () => abrirFormulario(null) },
      ['+ Novo usuário']
    )
  ]);

  const entradaBusca = elemento('input', {
    id: 'usuarios-busca',
    type: 'search',
    placeholder: 'Nome ou e-mail',
    autocomplete: 'off'
  });

  const seletorPerfil = elemento('select', { id: 'usuarios-perfil' }, [
    elemento('option', { value: '' }, ['Todos os perfis']),
    elemento('option', { value: 'admin' }, ['Administrador']),
    elemento('option', { value: 'operador' }, ['Operador'])
  ]);

  const seletorSituacao = elemento('select', { id: 'usuarios-situacao' }, [
    elemento('option', { value: '' }, ['Todas as situações']),
    elemento('option', { value: 'ativo' }, ['Somente ativos']),
    elemento('option', { value: 'inativo' }, ['Somente inativos'])
  ]);

  const filtros = elemento('form', { class: 'filtros', autocomplete: 'off' }, [
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'usuarios-busca' }, ['Buscar']),
      entradaBusca
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'usuarios-perfil' }, ['Perfil']),
      seletorPerfil
    ]),
    elemento('div', { class: 'campo' }, [
      elemento('label', { for: 'usuarios-situacao' }, ['Situação']),
      seletorSituacao
    ])
  ]);
  filtros.addEventListener('submit', (ev) => ev.preventDefault());

  const alvo = elemento('div', { id: 'usuarios-lista' });

  container.replaceChildren(topo, filtros, alvo, blocoMinhaConta());

  entradaBusca.addEventListener(
    'input',
    debounce(() => {
      estado.busca = entradaBusca.value.trim().toLowerCase();
      mostrarLista();
    }, 250)
  );

  seletorPerfil.addEventListener('change', () => {
    estado.perfil = seletorPerfil.value;
    mostrarLista();
  });

  seletorSituacao.addEventListener('change', () => {
    estado.situacao = seletorSituacao.value;
    mostrarLista();
  });

  /* ---------- Carregamento ---------- */

  async function carregar() {
    const sequencia = ++estado.requisicao;
    spinner(alvo, 'Carregando usuários…');

    try {
      const resposta = await api.get('/usuarios', { limite: LIMITE_BUSCA });
      if (sequencia !== estado.requisicao) return;

      // A rota pode ou não paginar; aceitamos os dois formatos.
      estado.todos = Array.isArray(resposta) ? resposta : resposta?.dados ?? [];
      mostrarLista();
    } catch (erro) {
      if (sequencia !== estado.requisicao) return;
      if (erro?.codigo === 'NAO_AUTENTICADO') return;
      mostrarErro(erro);
    }
  }

  function mostrarErro(erro) {
    alvo.replaceChildren(
      elemento('div', { class: 'vazio' }, [
        elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['⚠️']),
        elemento('h3', {}, ['Não foi possível carregar os usuários']),
        elemento('p', {}, [erro?.mensagem || 'Tente novamente em instantes.']),
        elemento(
          'button',
          { type: 'button', class: 'btn btn-secundario', onclick: () => carregar() },
          ['Tentar novamente']
        )
      ])
    );
  }

  /** Aplica busca, perfil e situação sobre a lista já carregada. */
  function filtrados() {
    return estado.todos.filter((usuario) => {
      if (estado.perfil && usuario.perfil !== estado.perfil) return false;
      if (estado.situacao === 'ativo' && !usuario.ativo) return false;
      if (estado.situacao === 'inativo' && usuario.ativo) return false;
      if (!estado.busca) return true;

      const alvoBusca = `${usuario.nome} ${usuario.email}`.toLowerCase();
      return alvoBusca.includes(estado.busca);
    });
  }

  /* ---------- Tabela ---------- */

  function linhaHtml(usuario) {
    const souEu = Number(usuario.id) === Number(eu?.id);

    const chipPerfil =
      usuario.perfil === 'admin'
        ? '<span class="badge badge-info">Administrador</span>'
        : '<span class="badge badge-neutro">Operador</span>';

    const chipSituacao = usuario.ativo
      ? '<span class="chip chip-ok">Ativo</span>'
      : '<span class="chip chip-na">Inativo</span>';

    // O próprio usuário não pode se desativar (o servidor recusa com 409),
    // então nem exibimos o botão para ele.
    const botaoSituacao = souEu
      ? ''
      : `<button type="button" class="btn btn-pequeno ${usuario.ativo ? 'btn-fantasma' : 'btn-secundario'}"
                 data-acao="${usuario.ativo ? 'desativar' : 'reativar'}" data-id="${usuario.id}">
           ${usuario.ativo ? 'Desativar' : 'Reativar'}
         </button>`;

    return `
      <tr class="${usuario.ativo ? '' : 'linha-inativa'}">
        <td data-rotulo="Nome">
          <span class="usuario-identidade">
            <strong>${escapar(usuario.nome)}</strong>
            ${souEu ? '<span class="texto-fraco texto-pequeno">Você</span>' : ''}
          </span>
        </td>
        <td data-rotulo="E-mail"><span class="texto-pequeno">${escapar(usuario.email)}</span></td>
        <td data-rotulo="Perfil">${chipPerfil}</td>
        <td data-rotulo="Situação">${chipSituacao}</td>
        <td data-rotulo="Cadastrado">${escapar(formatarData(usuario.criado_em))}</td>
        <td data-rotulo="Ações" class="acoes">
          <button type="button" class="btn btn-pequeno btn-secundario" data-acao="editar" data-id="${usuario.id}">Editar</button>
          <button type="button" class="btn btn-pequeno btn-secundario" data-acao="senha" data-id="${usuario.id}">Senha</button>
          ${botaoSituacao}
        </td>
      </tr>`;
  }

  function mostrarLista() {
    const lista = filtrados();

    if (!lista.length) {
      const semFiltro = !estado.busca && !estado.perfil && !estado.situacao;
      alvo.replaceChildren(
        elemento('div', { class: 'vazio' }, [
          elemento('div', { class: 'vazio-icone', 'aria-hidden': 'true' }, ['👤']),
          elemento('h3', {}, [semFiltro ? 'Nenhum usuário cadastrado' : 'Nenhum usuário encontrado']),
          elemento('p', {}, [
            semFiltro
              ? 'Cadastre os operadores que vão registrar os checklists no pátio.'
              : 'Ajuste os filtros para ver outros registros.'
          ]),
          semFiltro
            ? elemento(
                'button',
                { type: 'button', class: 'btn btn-primario', onclick: () => abrirFormulario(null) },
                ['+ Novo usuário']
              )
            : null
        ])
      );
      return;
    }

    const envolve = elemento('div', { class: 'tabela-envolve' }, [
      elemento('table', {
        class: 'tabela',
        html: `
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">E-mail</th>
              <th scope="col">Perfil</th>
              <th scope="col">Situação</th>
              <th scope="col">Cadastrado</th>
              <th scope="col"><span class="sr-apenas">Ações</span></th>
            </tr>
          </thead>
          <tbody>${lista.map(linhaHtml).join('')}</tbody>`
      })
    ]);

    envolve.addEventListener('click', (ev) => {
      const botao = ev.target.closest('button[data-acao]');
      if (!botao) return;

      const usuario = lista.find((item) => String(item.id) === botao.dataset.id);
      if (!usuario) return;

      if (botao.dataset.acao === 'editar') abrirFormulario(usuario);
      else if (botao.dataset.acao === 'senha') abrirRedefinicaoSenha(usuario);
      else if (botao.dataset.acao === 'desativar') desativar(usuario);
      else if (botao.dataset.acao === 'reativar') reativar(usuario);
    });

    const resumo = elemento('p', { class: 'texto-suave texto-pequeno' }, [
      `${formatarNumero(lista.length)} de ${formatarNumero(estado.todos.length)} usuário(s)`
    ]);

    alvo.replaceChildren(envolve, resumo);
  }

  /* ---------- Cadastro e edição ---------- */

  function abrirFormulario(usuario) {
    const edicao = Boolean(usuario);
    const souEu = edicao && Number(usuario.id) === Number(eu?.id);

    const campoNome = criarCampo({
      nome: 'nome',
      rotulo: 'Nome *',
      valor: usuario?.nome ?? '',
      cheia: true,
      atributos: { maxlength: 120, autocomplete: 'off' }
    });

    const campoEmail = criarCampo({
      nome: 'email',
      rotulo: 'E-mail *',
      tipo: 'email',
      valor: usuario?.email ?? '',
      cheia: true,
      atributos: { maxlength: 160, autocomplete: 'off', inputmode: 'email', spellcheck: 'false' }
    });

    const campoPerfil = criarCampo({
      nome: 'perfil',
      rotulo: 'Perfil *',
      valor: usuario?.perfil ?? 'operador',
      dica: souEu ? 'Você não pode alterar o seu próprio perfil.' : 'Administrador gerencia frota e usuários.',
      opcoes: [
        { valor: 'operador', rotulo: 'Operador' },
        { valor: 'admin', rotulo: 'Administrador' }
      ]
    });
    if (souEu) campoPerfil.entrada.disabled = true;

    const campoSenha = criarCampo({
      nome: 'senha',
      rotulo: 'Senha *',
      tipo: 'password',
      dica: `Mínimo de ${SENHA_MINIMA} caracteres.`,
      atributos: { autocomplete: 'new-password', minlength: SENHA_MINIMA }
    });

    const campos = {
      nome: campoNome,
      email: campoEmail,
      perfil: campoPerfil,
      senha: campoSenha
    };

    const form = elemento('form', { class: 'form-grade', novalidate: true, autocomplete: 'off' }, [
      campoNome.el,
      campoEmail.el,
      campoPerfil.el,
      // Na edição a senha tem fluxo próprio ("Redefinir senha").
      edicao ? null : campoSenha.el
    ]);

    const botaoSalvar = elemento(
      'button',
      { type: 'button', class: 'btn btn-primario', onclick: () => form.requestSubmit() },
      [edicao ? 'Salvar alterações' : 'Cadastrar usuário']
    );

    const botaoCancelar = elemento(
      'button',
      { type: 'button', class: 'btn btn-secundario', onclick: () => fecharModal() },
      ['Cancelar']
    );

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      Object.values(campos).forEach((campo) => campo.limpar());

      const nome = campoNome.valor;
      if (nome.length < 2) {
        campoNome.marcarErro('Informe o nome do usuário (mínimo 2 caracteres).');
        campoNome.entrada.focus();
        return;
      }

      const email = campoEmail.valor.toLowerCase();
      if (!emailValido(email)) {
        campoEmail.marcarErro('Informe um e-mail válido.');
        campoEmail.entrada.focus();
        return;
      }

      const corpo = { nome, email };
      if (!souEu) corpo.perfil = campoPerfil.valor;

      if (!edicao) {
        const senha = campoSenha.bruto;
        if (senha.length < SENHA_MINIMA) {
          campoSenha.marcarErro(`A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
          campoSenha.entrada.focus();
          return;
        }
        corpo.senha = senha;
      }

      botaoSalvar.disabled = true;
      const rotulo = botaoSalvar.textContent;
      botaoSalvar.textContent = 'Salvando…';

      try {
        if (edicao) await api.put(`/usuarios/${usuario.id}`, corpo);
        else await api.post('/usuarios', corpo);

        fecharModal();
        toast(edicao ? 'Usuário atualizado.' : 'Usuário cadastrado.', 'sucesso');
        carregar();
      } catch (erro) {
        tratarErroFormulario(erro, campos);
      } finally {
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = rotulo;
      }
    });

    abrirModal({
      titulo: edicao ? `Editar ${usuario.nome}` : 'Novo usuário',
      corpo: form,
      acoes: [botaoCancelar, botaoSalvar]
    });

    campoNome.entrada.focus();
  }

  /**
   * Erros do servidor (409 de e-mail duplicado / último admin, 400 de validação)
   * já vêm em português: destacamos o campo e repetimos a mensagem no toast.
   */
  function tratarErroFormulario(erro, campos) {
    if (erro.campos && typeof erro.campos === 'object') {
      for (const [nome, detalhe] of Object.entries(erro.campos)) {
        campos[nome]?.marcarErro(String(detalhe));
      }
    } else if (erro.codigo === 'CONFLITO' && campos.email && /e-?mail/i.test(erro.mensagem || '')) {
      campos.email.marcarErro('já cadastrado');
    }
    toast(erro.mensagem || 'Não foi possível concluir a operação.', 'erro');
  }

  /* ---------- Redefinição de senha (pelo administrador) ---------- */

  function abrirRedefinicaoSenha(usuario) {
    const campoNova = criarCampo({
      nome: 'senha',
      rotulo: 'Nova senha *',
      tipo: 'password',
      cheia: true,
      dica: `Mínimo de ${SENHA_MINIMA} caracteres.`,
      atributos: { autocomplete: 'new-password' }
    });

    const campoRepetir = criarCampo({
      nome: 'repetir',
      rotulo: 'Repita a nova senha *',
      tipo: 'password',
      cheia: true,
      atributos: { autocomplete: 'new-password' }
    });

    const form = elemento('form', { class: 'form-grade', novalidate: true, autocomplete: 'off' }, [
      elemento('p', { class: 'texto-suave texto-pequeno col-cheia' }, [
        `A nova senha passa a valer imediatamente para ${usuario.nome}.`
      ]),
      campoNova.el,
      campoRepetir.el
    ]);

    const botaoSalvar = elemento(
      'button',
      { type: 'button', class: 'btn btn-primario', onclick: () => form.requestSubmit() },
      ['Redefinir senha']
    );

    const botaoCancelar = elemento(
      'button',
      { type: 'button', class: 'btn btn-secundario', onclick: () => fecharModal() },
      ['Cancelar']
    );

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      campoNova.limpar();
      campoRepetir.limpar();

      const senha = campoNova.bruto;
      if (senha.length < SENHA_MINIMA) {
        campoNova.marcarErro(`A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
        campoNova.entrada.focus();
        return;
      }
      if (senha !== campoRepetir.bruto) {
        campoRepetir.marcarErro('As senhas não conferem.');
        campoRepetir.entrada.focus();
        return;
      }

      botaoSalvar.disabled = true;
      botaoSalvar.textContent = 'Redefinindo…';

      try {
        await api.put(`/usuarios/${usuario.id}`, { senha });
        fecharModal();
        toast(`Senha de ${usuario.nome} redefinida.`, 'sucesso');
      } catch (erro) {
        tratarErroFormulario(erro, { senha: campoNova });
      } finally {
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = 'Redefinir senha';
      }
    });

    abrirModal({
      titulo: `Redefinir senha — ${usuario.nome}`,
      corpo: form,
      acoes: [botaoCancelar, botaoSalvar]
    });

    campoNova.entrada.focus();
  }

  /* ---------- Desativar / reativar ---------- */

  async function desativar(usuario) {
    const confirmado = await confirmar(
      `Desativar ${usuario.nome}? A pessoa perde o acesso ao sistema, mas os checklists dela continuam no histórico.`,
      { titulo: 'Desativar usuário', textoConfirmar: 'Desativar', perigo: true }
    );
    if (!confirmado) return;

    try {
      await api.del(`/usuarios/${usuario.id}`);
      toast(`${usuario.nome} foi desativado.`, 'sucesso');
      carregar();
    } catch (erro) {
      // 409 típico: último administrador ativo do sistema.
      toast(erro.mensagem || 'Não foi possível desativar o usuário.', 'erro');
    }
  }

  async function reativar(usuario) {
    const confirmado = await confirmar(`Reativar o acesso de ${usuario.nome}?`, {
      titulo: 'Reativar usuário',
      textoConfirmar: 'Reativar'
    });
    if (!confirmado) return;

    try {
      await api.put(`/usuarios/${usuario.id}`, { ativo: true });
      toast(`${usuario.nome} foi reativado.`, 'sucesso');
      carregar();
    } catch (erro) {
      toast(erro.mensagem || 'Não foi possível reativar o usuário.', 'erro');
    }
  }

  /* ---------- Minha conta ---------- */

  function blocoMinhaConta() {
    const campoAtual = criarCampo({
      nome: 'senha-atual',
      rotulo: 'Senha atual *',
      tipo: 'password',
      atributos: { autocomplete: 'current-password' }
    });

    const campoNova = criarCampo({
      nome: 'senha-nova',
      rotulo: 'Nova senha *',
      tipo: 'password',
      dica: `Mínimo de ${SENHA_MINIMA} caracteres.`,
      atributos: { autocomplete: 'new-password' }
    });

    const campoRepetir = criarCampo({
      nome: 'senha-repetir',
      rotulo: 'Repita a nova senha *',
      tipo: 'password',
      atributos: { autocomplete: 'new-password' }
    });

    const botao = elemento('button', { type: 'submit', class: 'btn btn-primario' }, [
      'Alterar minha senha'
    ]);

    const form = elemento('form', { class: 'form-grade', novalidate: true, autocomplete: 'off' }, [
      campoAtual.el,
      campoNova.el,
      campoRepetir.el,
      elemento('div', { class: 'barra-acoes col-cheia' }, [botao])
    ]);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      [campoAtual, campoNova, campoRepetir].forEach((campo) => campo.limpar());

      const senhaAtual = campoAtual.bruto;
      const senhaNova = campoNova.bruto;

      if (!senhaAtual) {
        campoAtual.marcarErro('Informe a sua senha atual.');
        campoAtual.entrada.focus();
        return;
      }
      if (senhaNova.length < SENHA_MINIMA) {
        campoNova.marcarErro(`A nova senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
        campoNova.entrada.focus();
        return;
      }
      if (senhaNova === senhaAtual) {
        campoNova.marcarErro('A nova senha deve ser diferente da atual.');
        campoNova.entrada.focus();
        return;
      }
      if (senhaNova !== campoRepetir.bruto) {
        campoRepetir.marcarErro('As senhas não conferem.');
        campoRepetir.entrada.focus();
        return;
      }

      botao.disabled = true;
      botao.textContent = 'Alterando…';

      try {
        await api.post('/auth/senha', { senhaAtual, senhaNova });
        form.reset();
        toast('Senha alterada com sucesso.', 'sucesso');
      } catch (erro) {
        if (erro.codigo === 'VALIDACAO' && erro.campos?.senhaAtual) {
          campoAtual.marcarErro('senha incorreta');
        }
        toast(erro.mensagem || 'Não foi possível alterar a senha.', 'erro');
      } finally {
        botao.disabled = false;
        botao.textContent = 'Alterar minha senha';
      }
    });

    return elemento('section', { class: 'card' }, [
      elemento('div', { class: 'card-topo' }, [
        elemento('h2', {}, ['Minha conta']),
        elemento('span', { class: 'texto-fraco texto-pequeno' }, [eu?.email || ''])
      ]),
      form
    ]);
  }

  await carregar();
}
