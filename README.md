# Sistema de Checklist de Caminhões

Sistema web para registrar a **inspeção diária dos caminhões da frota**: o responsável abre o
sistema, escolhe o veículo, marca item por item se está conforme, anexa fotos do que estiver
irregular e o sistema calcula sozinho se o veículo está **Aprovado**, com **Restrição** ou
**Reprovado**.

Funciona no computador do escritório e também no **celular**, pelo navegador, dentro da mesma
rede Wi-Fi — ideal para preencher o checklist no pátio, com a câmera do aparelho.

Tudo fica gravado no próprio computador (banco de dados SQLite + pasta de fotos). Não depende de
internet nem de serviço de nuvem.

> ### Não existe campo "motorista"
> O sistema **não pergunta** o nome do motorista em lugar nenhum. O **responsável** por cada
> checklist é sempre o **usuário logado** — a pessoa da administração do transporte que fez a
> conferência. Por isso cada pessoa deve ter o seu próprio login: é assim que o sistema sabe quem
> assinou cada inspeção.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Instalação passo a passo (Windows)](#2-instalação-passo-a-passo-windows)
3. [Como iniciar o sistema](#3-como-iniciar-o-sistema)
4. [Credenciais iniciais](#4-credenciais-iniciais)
5. [Acessar pelo celular na mesma rede Wi-Fi](#5-acessar-pelo-celular-na-mesma-rede-wi-fi)
6. [Estrutura de pastas](#6-estrutura-de-pastas)
7. [Scripts npm](#7-scripts-npm)
8. [Tabelas do banco de dados](#8-tabelas-do-banco-de-dados)
9. [Rotas da API](#9-rotas-da-api)
10. [Como funcionam as fotos](#10-como-funcionam-as-fotos)
11. [Regra da situação: Aprovado / Restrição / Reprovado](#11-regra-da-situação-aprovado--restrição--reprovado)
12. [Backup](#12-backup)
13. [Solução de problemas](#13-solução-de-problemas)

---

## 1. Requisitos

| Item | Detalhe |
|---|---|
| Sistema operacional | Windows 10 ou 11 (também funciona em Linux e macOS) |
| Node.js | **versão 22.5 ou superior** — testado na 24.x. Baixe a versão **LTS** em <https://nodejs.org> |
| Espaço em disco | ~200 MB, mais o espaço das fotos |
| Navegador | Chrome, Edge ou Firefox atualizados (no celular também) |
| Internet | Necessária **apenas** na instalação, para baixar os componentes |

O banco de dados usa o módulo **nativo** `node:sqlite` do Node.js — não é preciso instalar
nenhum banco separado.

---

## 2. Instalação passo a passo (Windows)

1. **Instale o Node.js**
   - Acesse <https://nodejs.org> e baixe a versão **LTS** para Windows.
   - Execute o instalador e clique em *Avançar* até o final, sem mudar nada.
   - Para conferir se deu certo: abra o **Prompt de Comando** e digite `node --version`.
     Deve aparecer algo como `v24.17.0`.

2. **Coloque a pasta do sistema no computador**
   - Copie a pasta `CHECKLIST DE CAMINHÕES` para um local definitivo,
     por exemplo `C:\Sistemas\CHECKLIST DE CAMINHÕES`.
   - Evite deixá-la dentro do OneDrive: a sincronização pode travar o arquivo do banco.

3. **(Opcional) Ajuste as configurações**
   - Faça uma cópia do arquivo `.env.example` e renomeie a cópia para `.env`.
   - Abra no Bloco de Notas e altere o que precisar (porta, senha do admin, limites de foto).
   - Se você pular esta etapa, o sistema usa os valores padrão — funciona normalmente.

4. **Dê dois cliques em `INICIAR.bat`**
   - Na primeira execução ele instala os componentes, cria o banco de dados,
     cadastra o usuário administrador e sobe o servidor.
   - Isso pode levar alguns minutos. **Não feche a janela preta.**
   - O navegador abre sozinho em `http://localhost:3000` — ou na porta que você
     tiver definido em `PORT` no arquivo `.env`, que o `INICIAR.bat` respeita.

Pronto. Nas próximas vezes, a inicialização é quase instantânea.

---

## 3. Como iniciar o sistema

### Jeito fácil (recomendado)

Dois cliques em **`INICIAR.bat`**. Ele cuida de tudo:

- confere se o Node.js está instalado (e explica o que fazer se não estiver);
- roda `npm install` se a pasta `node_modules` não existir;
- cria e popula o banco na primeira execução;
- sobe o servidor e abre o navegador.

> **Dica:** clique com o botão direito em `INICIAR.bat` → *Enviar para* → *Área de trabalho
> (criar atalho)* para deixar o ícone à mão.

### Jeito manual (linha de comando)

```bat
cd "C:\Sistemas\CHECKLIST DE CAMINHÕES"
npm install
npm run migrate
npm run seed
npm start
```

### Para encerrar

Feche a janela preta ou pressione **Ctrl + C** dentro dela. Enquanto essa janela estiver aberta,
o sistema está no ar — inclusive para os celulares da rede.

---

## 4. Credenciais iniciais

| Campo | Valor |
|---|---|
| E-mail | `admin@transporte.com` (ou o que estiver em `ADMIN_EMAIL`) |
| Senha | a que o `npm run seed` mostrou no console |

> ## ⚠️ ANOTE A SENHA EXIBIDA PELO `npm run seed`
>
> **Não existe senha padrão neste sistema.** Se você não definiu `ADMIN_SENHA` no arquivo
> `.env`, o comando `npm run seed` gera uma senha aleatória e a imprime **uma única vez**,
> logo abaixo de "Credenciais de acesso". Anote-a antes de fechar a janela.
>
> Essa senha é **provisória**: ao entrar, o sistema abre direto a tela de troca e não libera
> nenhuma outra função enquanto você não definir a sua senha pessoal (mínimo 6 caracteres).
>
> Perdeu a senha antes de trocá-la? Defina `ADMIN_SENHA` no `.env`, apague o usuário admin do
> banco e rode `npm run seed` de novo.
>
> Depois disso, crie um **login individual para cada pessoa** que preenche checklists
> (menu **Usuários**, perfil `operador`). Assim cada inspeção fica corretamente assinada.

Perfis disponíveis:

| Perfil | O que pode fazer |
|---|---|
| `admin` | Tudo: gerenciar usuários e veículos, editar e **excluir** qualquer checklist, ver relatórios |
| `operador` | Criar checklists, editar **os próprios** checklists, cadastrar veículos, ver relatórios. Não gerencia usuários e **não exclui** checklists |

---

## 5. Acessar pelo celular na mesma rede Wi-Fi

O sistema foi feito para ser usado no pátio, pelo celular. O computador que roda o
`INICIAR.bat` funciona como servidor; os celulares apenas acessam.

**Passo a passo:**

1. Deixe o `INICIAR.bat` rodando no computador (janela preta aberta).
2. Olhe o quadro que aparece na janela preta. Ele mostra dois endereços:

   ```
   Neste computador:  http://localhost:3000
   Na rede (celular): http://192.168.0.10:3000
   ```

3. Conecte o celular **na mesma rede Wi-Fi** do computador.
4. No navegador do celular, digite o endereço da linha **"Na rede (celular)"**,
   incluindo o `:3000` no final.
5. Faça login normalmente. Dica: use *Adicionar à tela de início* no menu do navegador para
   criar um ícone e usar como se fosse um aplicativo.

### Se o celular não abrir a página: liberar a porta no firewall

Na primeira vez, o Windows costuma bloquear conexões vindas de outros aparelhos.

- **Quando aparecer o aviso do Firewall do Windows** ao iniciar o sistema, marque
  **Redes privadas** e clique em **Permitir acesso**.

- **Se o aviso não apareceu ou foi negado**, abra o **PowerShell como Administrador**
  (botão direito no menu Iniciar → *Terminal (Administrador)*) e execute:

  ```powershell
  New-NetFirewallRule -DisplayName "Checklist de Caminhoes" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
  ```

- Confirme também que o Wi-Fi do computador está classificado como **Rede privada**
  (Configurações → Rede e Internet → Wi-Fi → propriedades da rede).

> Em redes de visitantes/convidados o roteador costuma isolar os aparelhos entre si.
> Nesse caso, conecte todos na rede principal da empresa.

---

## 6. Estrutura de pastas

```
CHECKLIST DE CAMINHÕES/
│
├── INICIAR.bat              Iniciador para Windows (dois cliques)
├── package.json             Dependências e scripts do projeto
├── .env.example             Modelo de configuração (copie para .env)
├── .gitignore               Arquivos que não vão para o controle de versão
├── README.md                Este manual
│
├── data/                    ⚠️ TODOS OS DADOS REAIS — é isto que se copia no backup
│   ├── checklist.db         Banco de dados SQLite (veículos, checklists, usuários)
│   ├── .segredo             Chave de assinatura dos logins (gerada automaticamente)
│   └── uploads/             Fotos dos checklists, uma por arquivo
│
├── docs/
│   ├── API.md               Contrato técnico da API (para desenvolvedores)
│   └── MANUAL-DE-USO.md     Guia do dia a dia para quem preenche checklists
│
├── public/                  Frontend: telas que rodam no navegador
│
├── src/                     Código do servidor
│   ├── server.js            Ponto de entrada: sobe o servidor HTTP
│   ├── app.js               Montagem do Express, middlewares e rotas
│   ├── config.js            Leitura do .env e caminhos do projeto
│   │
│   ├── db/
│   │   ├── index.js         Acesso ao SQLite (node:sqlite)
│   │   ├── schema.sql       Estrutura das tabelas e catálogo de itens
│   │   ├── migrate.js       Cria/atualiza a estrutura do banco
│   │   ├── seed.js          Cria o admin e veículos de exemplo
│   │   └── reset.js         Apaga tudo e recomeça do zero
│   │
│   ├── lib/                 Utilitários: senha, JWT, validação, fotos, status, auditoria
│   ├── middleware/          Autenticação e tratamento de erros
│   ├── routes/              Rotas HTTP da API
│   └── services/            Regras de negócio e consultas
│
└── tests/
    └── api.test.js          Testes automáticos de integração da API
```

---

## 7. Scripts npm

Execute no Prompt de Comando, dentro da pasta do projeto.

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor em `http://localhost:3000` |
| `npm run dev` | Sobe o servidor reiniciando sozinho a cada alteração no código (desenvolvimento) |
| `npm run migrate` | Cria/atualiza as tabelas do banco a partir de `src/db/schema.sql` |
| `npm run seed` | Cria o usuário administrador e veículos de exemplo (pode rodar mais de uma vez) |
| `npm run reset` | **Apaga o banco e recomeça do zero.** Faça backup antes! |
| `npm run recalcular` | Reprocessa a situação de todos os checklists já gravados com a regra atual |
| `npm test` | Roda os testes automáticos (`node --test tests/`) |
| `npm install` | Baixa/instala as dependências (`express`, `cors`, `dotenv`) |

---

## 8. Tabelas do banco de dados

Arquivo único: `data/checklist.db`.

| Tabela | Para que serve |
|---|---|
| `usuarios` | Quem acessa o sistema. Guarda `nome`, `email`, `senha_hash`, `perfil` (`admin`/`operador`) e `ativo`. A senha **nunca** é guardada em texto puro — só o hash `scrypt`. |
| `veiculos` | Frota. `placa` (única), `frota`, `modelo`, `marca`, `ano`, `tipo_carroceria`, `possui_lona`, `observacoes`, `ativo`. Exclusão é lógica (`ativo = 0`), preservando o histórico. |
| `itens_catalogo` | O que é inspecionado. `chave`, `nome`, `dica`, `categoria` (`inspecao`/`documentacao`), `critico` e `ordem`. Vem preenchido com 14 itens; ajuste aqui para mudar o formulário inteiro. |
| `checklists` | Cabeçalho de cada inspeção: veículo, **usuario_id** (o responsável), data, hora, km, validades do CRLV e do tacógrafo, dados da lona, observações, situação calculada e os totais de OK/NC/NA/PEND. |
| `checklist_itens` | Resposta de cada item em cada checklist: `OK`, `NC`, `NA` ou `PEND`, com observação. |
| `fotos` | Registro de cada foto: nome do arquivo em disco, tipo, tamanho, legenda e, opcionalmente, a qual item ela se refere. |
| `auditoria` | Trilha de quem fez o quê: usuário, ação, entidade, IP e data/hora. Visível em **Auditoria** no menu (só admin), e gravada de forma que a API não consegue alterar nem apagar. |
| `vw_checklists` | *View* (consulta pronta) usada na tela de histórico, já com placa, responsável e contagem de fotos. |

**Itens marcados como críticos** (o sistema **alerta** quando um deles está em não conformidade,
antes de você decidir — ver [seção 11](#11-regra-da-situação-aprovado--restrição--reprovado)):
`pneus`, `luz_freio`, `vazamentos`, `freio`, `crlv` e `tacografo`.

---

## 9. Rotas da API

Base: `http://localhost:3000/api` · Autenticação: header `Authorization: Bearer <token>`.
Detalhes completos em [`docs/API.md`](docs/API.md).

| Grupo | Rotas principais |
|---|---|
| **Saúde** (público) | `GET /api/saude` |
| **Autenticação** | `POST /api/auth/login` (público) · `GET /api/auth/eu` · `POST /api/auth/senha` |
| **Usuários** (só admin) | `GET /api/usuarios` · `POST` · `PUT /:id` · `DELETE /:id` (desativa) |
| **Veículos** | `GET /api/veiculos` · `POST` · `GET /:id` · `PUT /:id` · `DELETE /:id` (desativa) |
| **Catálogo de itens** | `GET /api/itens` |
| **Checklists** | `GET /api/checklists` (com filtros e paginação) · `POST` · `GET /:id` · `PUT /:id` · `DELETE /:id` (só admin) |
| **Fotos** | `POST /api/checklists/:id/fotos` · `GET /api/checklists/:id/fotos` · `DELETE /api/fotos/:id` |
| **Relatórios** | `GET /api/relatorios/resumo` · `/nao-conformidades` · `/veiculos` · `/alertas` |
| **Exportação** | `GET /api/exportar/csv?de=&ate=&placa=` |
| **Auditoria** (só admin) | `GET /api/auditoria` (com filtros e paginação) · `/opcoes` — **somente leitura** |

Formato das respostas:

```json
{ "ok": true,  "dados": { } }
{ "ok": false, "erro": { "codigo": "VALIDACAO", "mensagem": "Placa é obrigatória", "campos": { } } }
```

---

## 10. Como funcionam as fotos

- No celular, o botão de foto abre **a câmera**; no computador, abre o seletor de arquivos.
- A imagem é enviada ao servidor **dentro do próprio JSON**, em formato base64
  (`data:image/jpeg;base64,...`).
- O servidor:
  1. confere se é realmente uma imagem, lendo os **primeiros bytes do arquivo** —
     não confia na extensão nem no tipo informado pelo navegador;
  2. aceita apenas **JPEG, PNG e WebP**;
  3. recusa arquivos acima de **5 MB** (`MAX_FOTO_MB`) e mais de **20 fotos por checklist**
     (`MAX_FOTOS_CHECKLIST`);
  4. gera um **nome novo e aleatório** (`UUID` + extensão) — o nome vindo do cliente é
     descartado, por segurança;
  5. grava o arquivo em **`data/uploads/`** e cria o registro na tabela `fotos`.
- Para exibir, o sistema devolve a URL `/uploads/<arquivo>`.
- A foto pode ser **do checklist inteiro** ou **de um item específico** (campo `item_chave`) —
  neste caso ela aparece ao lado do item na tela de detalhes e na impressão.
- Ao **excluir uma foto** ou **excluir um checklist**, o arquivo é apagado do disco junto com o
  registro. Não fica lixo acumulado.
- O envio do checklist é feito em **uma única transação**: se uma foto falhar, nada é salvo —
  não existe checklist pela metade.

> **Onde ficam guardadas:** `data/uploads/`. É uma pasta comum — você pode abrir pelo Explorador
> de Arquivos e ver as imagens. Só não renomeie nem apague arquivos por lá, ou o sistema
> mostrará fotos quebradas.

---

## 11. Regra da situação: Aprovado / Restrição / Reprovado

**Quem decide é você.** No fim do formulário existe a pergunta *"Você aprova o veículo?"*, de
resposta obrigatória. Essa decisão **vale mais que o cálculo automático dos itens**: se você
aprovou o caminhão, ele **não sai reprovado**, por mais NC que a inspeção tenha apontado.

O que os itens fazem é apenas **qualificar** a sua aprovação — registrando que ela saiu com
pendência. O status final nunca é enviado pelo navegador: o **servidor calcula** a partir da sua
decisão somada às respostas. Se o navegador tentar mandar um status pronto, ele é ignorado.

Cada item pode ser respondido como:

| Resposta | Significado |
|---|---|
| **OK** | Conforme, sem problema |
| **NC** | Não conforme — há um problema |
| **NA** | Não se aplica a este veículo |
| **PEND** | Não foi informado (item deixado em branco) |

A regra, na ordem:

1. **REPROVADO** — se você respondeu **"✕ Não aprovo o veículo"**. Ponto final: nenhum item OK
   reverte isso.
2. **RESTRIÇÃO** — se você **aprovou**, mas há **algum NC** (crítico ou não) **ou** o veículo
   possui lona em condição **RUIM**. O caminhão está liberado, e fica registrado que saiu com
   pendência.
3. **APROVADO** — se você **aprovou** e não há nenhum NC nem lona ruim.

> Itens **NA** e **PEND** não reprovam nem restringem — mas ficam contados no resumo
> (`{ ok, nc, na, pendente }`), para você enxergar o que ficou em branco.

**Exemplos:**

| Sua decisão | Situação registrada | Resultado |
|---|---|---|
| ✓ Aprovo | Todos os itens OK, sem lona | **APROVADO** |
| ✓ Aprovo | Buzina NC (não crítico) | **RESTRIÇÃO** |
| ✓ Aprovo | Todos OK, mas lona RUIM | **RESTRIÇÃO** |
| ✓ Aprovo | Freio NC (crítico) | **RESTRIÇÃO** — sua aprovação manda |
| ✓ Aprovo | Metade dos itens em branco, nenhum NC | **APROVADO**, com pendências no resumo |
| ✕ Não aprovo | Todos os itens OK | **REPROVADO** |
| ✕ Não aprovo | Freio NC | **REPROVADO** |

**Para que serve o "crítico", então?** Os itens críticos (pneus, luz de freio, vazamentos, freio,
CRLV e tacógrafo) continuam **avisando** na tela antes de você decidir — o texto abaixo da
pergunta alerta quando há crítico em NC. Eles orientam a decisão; não a substituem.

> **Registros antigos:** checklists lançados antes da existência da pergunta de decisão não têm
> resposta gravada. Só nesses o status continua vindo apenas dos itens (crítico em NC = reprovado).
> Para atualizá-los, abra o checklist, responda a decisão e salve.

### Recalcular o histórico

O status fica **gravado** em cada checklist — não se refaz sozinho quando a regra muda. Se você
alterar a regra ou marcar itens como críticos, rode:

```bat
npm run recalcular
```

O script reprocessa todos os checklists gravados e mostra quais mudaram de situação.

---

## 12. Backup

**Todo o conteúdo do sistema — banco de dados e fotos — está dentro da pasta `data/`.**
Fazer backup é literalmente **copiar essa pasta**.

### Como fazer

1. **Encerre o sistema** (feche a janela preta ou Ctrl + C). Isso garante que o banco seja
   gravado por completo.
2. Copie a pasta inteira **`data`** para o destino do backup:
   pen drive, HD externo, pasta de rede ou nuvem.
3. Renomeie a cópia com a data, por exemplo `data-2026-07-20`.

Pelo Prompt de Comando, com o sistema parado:

```bat
cd "C:\Sistemas\CHECKLIST DE CAMINHÕES"
robocopy "data" "D:\Backups\checklist\data-%date:~6,4%-%date:~3,2%-%date:~0,2%" /E
```

### Como restaurar

1. Encerre o sistema.
2. Renomeie a pasta `data` atual para `data-antiga` (não apague ainda).
3. Copie a pasta do backup para o lugar dela, com o nome `data`.
4. Inicie o sistema e confira o histórico.

### Recomendações

- Faça backup **no fim de cada dia** de uso, ou pelo menos uma vez por semana.
- Guarde **pelo menos as 3 últimas cópias** — se a mais recente estiver com defeito,
  você ainda tem para onde voltar.
- Mantenha **uma cópia fora do computador** (nuvem ou HD externo guardado em outro lugar).
- A pasta `data/` cresce principalmente por causa das fotos. Se ficar grande demais,
  arquive os backups antigos em disco externo.

> Não é preciso copiar `node_modules/` nem `src/` no backup do dia a dia: esses arquivos são
> reinstaláveis. O que é insubstituível é a pasta `data/`.

---

## 13. Solução de problemas

### "A porta 3000 já está em uso"

Outro programa (ou uma janela do sistema que ficou aberta) está usando a porta.

1. **Verifique se o sistema já não está rodando** em outra janela preta. Se estiver, use essa.
2. Descubra quem está usando a porta — Prompt de Comando:

   ```bat
   netstat -ano | findstr :3000
   ```

   O último número da linha é o **PID**. Para encerrar esse programa:

   ```bat
   taskkill /PID 12345 /F
   ```

3. **Ou simplesmente use outra porta:** abra o arquivo `.env` e altere para `PORT=3001`.
   Depois acesse `http://localhost:3001` (e ajuste também a regra do firewall, se usar celular).

### "Esqueci a senha do administrador"

Como as senhas são guardadas com hash, não há como "ver" a senha — é preciso definir uma nova.

1. Encerre o sistema.
2. Se **outro usuário admin** ainda tiver acesso, peça a ele para entrar em **Usuários**,
   abrir seu cadastro e definir uma nova senha. Resolvido.
3. Se **ninguém** consegue entrar, redefina a senha do admin padrão pelo Prompt de Comando,
   na pasta do projeto:

   ```bat
   node -e "import('./src/db/index.js').then(async d => { const {gerarHash} = await import('./src/lib/senha.js'); d.executar('UPDATE usuarios SET senha_hash = ? WHERE email = ?', gerarHash('NovaSenha123'), 'admin@transporte.com'); console.log('Senha redefinida.'); d.fechar(); })"
   ```

   Troque `NovaSenha123` pela senha desejada e `admin@transporte.com` pelo e-mail do
   administrador, se você o alterou. **Entre no sistema e troque a senha em seguida.**

### "O banco de dados está corrompido"

Sinais: erro `database disk image is malformed` ou o sistema não sobe.

1. Encerre o sistema.
2. **Faça uma cópia da pasta `data/`** antes de qualquer tentativa — mesmo danificada.
3. Tente a recuperação automática do SQLite (Prompt de Comando, na pasta do projeto):

   ```bat
   node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('data/checklist.db'); console.log(db.prepare('PRAGMA integrity_check').all());"
   ```

   Se responder `ok`, o banco está íntegro e o problema é outro.
4. Se estiver realmente danificado, **restaure o último backup** (seção 12).
5. Sem backup e sem alternativa, comece um banco novo — **os checklists antigos serão perdidos**,
   mas as fotos em `data/uploads/` continuam lá:

   ```bat
   npm run reset
   npm run seed
   ```

> Causa mais comum: desligar o computador na tomada com o sistema aberto, ou deixar a pasta
> dentro do OneDrive/Dropbox sincronizando. Prefira uma pasta local, como `C:\Sistemas\`.

### "As fotos não aparecem"

Vá testando na ordem:

1. **A pasta existe?** Confira se `data/uploads/` está lá e tem arquivos.
   Se você apagou a pasta, crie-a novamente (vazia) e reinicie o sistema.
2. **Cache do navegador:** pressione **Ctrl + F5** para recarregar ignorando o cache
   (as fotos são servidas com cache de 7 dias).
3. **Abra a foto direto:** acesse `http://localhost:3000/uploads/nome-do-arquivo.jpg`.
   - Se abrir aqui mas não na tela: é cache ou bloqueador de conteúdo do navegador.
   - Se der 404: o arquivo foi apagado ou renomeado manualmente. Restaure do backup.
4. **Pelo celular:** confirme que você acessou pelo IP da rede (`http://192.168.x.x:3000`)
   e não por `localhost` — `localhost` no celular aponta para o próprio celular.
5. **Foto não sobe (erro ao enviar):** a imagem passa de 5 MB. Reduza a qualidade na câmera
   ou aumente `MAX_FOTO_MB` no `.env`. Lembre que o limite de fotos por checklist é 20.
6. **Antivírus:** alguns bloqueiam gravação em pastas de programas. Adicione a pasta do
   projeto às exceções.

### "O INICIAR.bat abre e fecha na hora"

Abra o Prompt de Comando, vá até a pasta e execute `INICIAR.bat` por lá — assim a mensagem de
erro fica visível. Normalmente é Node.js ausente ou desatualizado (`node --version` precisa ser
22.5 ou superior).

### "Os acentos aparecem errados na janela preta"

O `INICIAR.bat` já executa `chcp 65001` para corrigir isso. Se ainda ocorrer, atualize o
**Terminal do Windows** ou rode `npm start` pelo PowerShell.

### Nada resolveu

Rode os testes automáticos para saber se o problema é no sistema ou no ambiente:

```bat
npm test
```

Se os testes passarem, o sistema está íntegro — o problema está na configuração, na rede ou
nos dados. Guarde a mensagem de erro completa da janela preta ao pedir ajuda.
