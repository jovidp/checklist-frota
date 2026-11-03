# Manual de Uso — Checklist de Caminhões

**Para quem usa o sistema no dia a dia.**
Sem termos técnicos. É só seguir os passos.

---

## Índice

1. [O que é este sistema](#1-o-que-é-este-sistema)
2. [Como entrar (login)](#2-como-entrar-login)
3. [Preencher um checklist passo a passo](#3-preencher-um-checklist-passo-a-passo)
4. [Tirar e anexar fotos pelo celular](#4-tirar-e-anexar-fotos-pelo-celular)
5. [Consultar o histórico](#5-consultar-o-histórico)
6. [Imprimir ou salvar em PDF](#6-imprimir-ou-salvar-em-pdf)
7. [Exportar para o Excel](#7-exportar-para-o-excel)
8. [Cadastrar um veículo novo](#8-cadastrar-um-veículo-novo)
9. [Trocar a sua senha](#9-trocar-a-sua-senha)
10. [Auditoria: quem fez o quê (administrador)](#10-auditoria-quem-fez-o-quê-administrador)
11. [Dúvidas frequentes](#11-dúvidas-frequentes)

---

## 1. O que é este sistema

É a ficha de inspeção do caminhão, só que no celular ou no computador.

Você escolhe o veículo, percorre a lista de itens marcando **está bom** ou **tem problema**,
tira foto do que estiver errado e salva. O sistema:

- calcula sozinho se o veículo saiu **Aprovado**, com **Restrição** ou **Reprovado**;
- guarda tudo com a sua identificação, a data e a hora;
- monta o histórico de cada caminhão, para consulta a qualquer momento.

> ### Importante: não se digita o nome do motorista
> O sistema **não pede** o nome de nenhum motorista. Quem assina o checklist é **você**, a
> pessoa que fez a conferência e está logada no sistema. Por isso **use sempre o seu próprio
> login** — nunca o de um colega. É assim que a empresa sabe quem conferiu cada veículo.

---

## 2. Como entrar (login)

### No computador do escritório

Dê dois cliques no ícone **INICIAR.bat**. Uma janela preta abre e, em seguida, o navegador
abre sozinho na tela de login.

> ⚠️ **Não feche a janela preta.** Ela é o "motor" do sistema. Se ela fechar, o sistema sai do ar
> para todo mundo, inclusive para os celulares.

### No celular (no pátio)

1. O computador do escritório precisa estar ligado, com o sistema aberto.
2. Conecte o celular no **Wi-Fi da empresa** — o mesmo do computador.
3. Abra o navegador (Chrome ou Safari) e digite o endereço que aparece na janela preta do
   computador, na linha **"Na rede (celular)"**. É algo como:

   ```
   http://192.168.0.10:3000
   ```

4. Não esqueça do `:3000` no final.

> 💡 **Dica de ouro:** depois de abrir, use o menu do navegador → **Adicionar à tela de início**.
> Vai criar um ícone no celular e você nunca mais precisa digitar o endereço.

### A tela de login

```
  ┌────────────────────────────────┐
  │   CHECKLIST DE CAMINHÕES       │
  │                                │
  │   E-mail                       │
  │   [ ____________________ ]     │
  │                                │
  │   Senha                        │
  │   [ ____________________ ]     │
  │                                │
  │        [   ENTRAR   ]          │
  └────────────────────────────────┘
```

Digite o e-mail e a senha que o responsável lhe passou e toque em **ENTRAR**.

**Deu erro?**

| Mensagem | O que fazer |
|---|---|
| "E-mail ou senha incorretos" | Confira se não há espaço sobrando e se o Caps Lock está desligado |
| A página nem abre | O computador do escritório está desligado, ou o celular está em outro Wi-Fi |
| "Sessão expirada" | Normal depois de 12 horas. É só entrar de novo |

---

## 3. Preencher um checklist passo a passo

### Passo 1 — Toque em "Novo Checklist"

É o botão grande na tela inicial.

### Passo 2 — Escolha o veículo

Digite a placa ou o número da frota na busca e toque no caminhão certo.

```
  Buscar:  [ ABC ________ ]

  ┌──────────────────────────────────────┐
  │  ABC1D23  ·  Frota 08                │
  │  VW Constellation 24.280 — Baú       │  ← toque aqui
  └──────────────────────────────────────┘
```

> Não achou o caminhão? Veja a [seção 8](#8-cadastrar-um-veículo-novo) para cadastrá-lo.

### Passo 3 — Preencha o cabeçalho

| Campo | O que colocar |
|---|---|
| **Data** | Já vem com a data de hoje. Só mude se estiver lançando algo de outro dia |
| **Hora** | Já vem com a hora atual |
| **KM** | O número do hodômetro do painel, só os números inteiros |
| **Validade do CRLV** | A data que está no documento do veículo |
| **Validade do Tacógrafo** | A data do selo/certificado de aferição |

### Passo 4 — Percorra a lista de itens

Esta é a parte principal. Para **cada item** da lista, toque em uma das quatro opções:

| Botão | Quando usar |
|---|---|
| ✅ **OK** | Está tudo certo com esse item |
| ❌ **NC** | "Não conforme" — **tem problema** neste item |
| ➖ **NA** | "Não se aplica" — este caminhão não tem esse item |
| ⬜ (em branco) | Você ainda não conferiu. Fica como **pendente** |

```
  ┌────────────────────────────────────────────┐
  │  1. Pneus                        🔴 CRÍTICO│
  │     Calibragem, sulco, cortes e estepe     │
  │                                            │
  │     [ ✅ OK ]  [ ❌ NC ]  [ ➖ NA ]         │
  │                                            │
  │     Observação: [ ________________ ]       │
  │     📷 Adicionar foto                      │
  └────────────────────────────────────────────┘
```

**Regras práticas:**

- Itens marcados com **🔴 CRÍTICO** (pneus, luz de freio, vazamentos, freio, CRLV e tacógrafo)
  são os mais graves: o sistema **avisa** quando um deles está com problema, para você pensar duas
  vezes antes de liberar. Confira esses com atenção redobrada. Quem decide, no fim, é você.
- Marcou **NC**? Então **escreva na observação o que está errado** e, de preferência,
  **tire uma foto**. Sem isso, a manutenção não sabe o que procurar.
  - ❌ Ruim: "com problema"
  - ✅ Bom: "pneu dianteiro direito com sulco abaixo de 2mm e corte na lateral"
- **NA** é para item que o caminhão realmente não tem. Não use NA só para pular item.
- Item deixado em branco fica como **pendente** e aparece no resumo — o responsável vai
  ver que ficou faltando conferir.

### Passo 5 — Lona (quando houver)

Se o caminhão usa lona, marque **Possui lona: Sim** e escolha:

- **BOA** — íntegra, sem rasgos, bem amarrada;
- **RUIM** — rasgada, furada, faltando amarração ou desgastada.

> ⚠️ Lona **RUIM** conta como não conformidade: se você aprovar o caminhão, ele fica em
> **Restrição** em vez de Aprovado.

Se o caminhão não usa lona, deixe **Possui lona: Não** — o campo de condição some.

### Passo 6 — Observações gerais

Espaço livre para o que não coube nos itens: barulho estranho, combustível baixo, avaria na
cabine, recado para a manutenção.

### Passo 7 — Salvar

Toque em **SALVAR CHECKLIST**. Na hora, aparece o resultado:

```
  ┌────────────────────────────────────────┐
  │           ⚠️  RESTRIÇÃO                 │
  │                                        │
  │  ✅ 12 conformes    ❌ 1 não conforme   │
  │  ➖  1 não se aplica  ⬜ 0 pendentes     │
  └────────────────────────────────────────┘
```

### Entendendo o resultado

**Quem decide é você.** Antes de salvar, o sistema pergunta *"Você aprova o veículo?"* — e a sua
resposta vale mais que a conta dos itens. Se você aprovou, o caminhão **não sai reprovado**, por
mais problema que o checklist tenha apontado. Os itens só qualificam a sua aprovação:

| Sua resposta | Itens | Resultado | O que significa na prática |
|---|---|---|---|
| ✓ Aprovo | Nenhum problema, lona boa (ou sem lona) | 🟢 **APROVADO** | Caminhão liberado |
| ✓ Aprovo | Tem NC (crítico ou não), ou lona RUIM | 🟡 **RESTRIÇÃO** | Caminhão liberado por você, **com pendência registrada**. Avise a manutenção |
| ✕ Não aprovo | Qualquer situação | 🔴 **REPROVADO** | **Caminhão não deve sair.** Avise o responsável imediatamente |

> Aprovou um caminhão com o freio em NC porque o mecânico ajustou na hora? Ele fica como
> **RESTRIÇÃO**, e não reprovado. Escreva o motivo nas observações gerais — é isso que explica
> a decisão para quem for olhar o histórico depois.

---

## 4. Tirar e anexar fotos pelo celular

Foto é a melhor forma de mostrar o problema. Vale muito mais que uma descrição.

### Foto de um item específico (recomendado)

1. No item que você marcou como **NC**, toque em **📷 Adicionar foto**.
2. O celular pergunta: escolha **Câmera** (para tirar na hora) ou **Galeria**
   (para usar uma foto já tirada).
3. Enquadre o problema e tire a foto.
4. Escreva uma **legenda** curta: "pneu dianteiro direito", "vazamento no motor".
5. Pronto — a miniatura aparece embaixo do item.

Essa foto fica **grudada naquele item**: quem abrir o checklist depois vê a imagem
exatamente ao lado do problema.

### Foto geral do checklist

Na parte de baixo do formulário há a área **Fotos do checklist**, para imagens que não são
de um item específico: frente do caminhão, painel com o hodômetro, carga amarrada.

### Regras das fotos

| Regra | Valor |
|---|---|
| Formatos aceitos | JPEG, PNG e WebP (a câmera do celular já usa JPEG) |
| Tamanho máximo | 5 MB por foto |
| Quantidade máxima | 20 fotos por checklist |

**Dicas para fotos que ajudam:**

- Aproxime-se do problema, mas mostre um pouco em volta para dar referência.
- Cuidado com contraluz. Se estiver escuro, use o flash.
- Limpe a lente do celular — pátio é lugar de poeira.
- Uma foto boa vale mais que cinco tortas. Não encha o checklist de fotos repetidas.

### Apagar uma foto

Toque na miniatura e depois no **🗑 Excluir**. Ela some da tela e é apagada de vez.
**Não dá para desfazer** — se apagar sem querer, tire outra.

---

## 5. Consultar o histórico

Toque em **Histórico** no menu. Aparece a lista dos checklists, do mais novo para o mais antigo:

```
  ┌──────────────────────────────────────────────────────┐
  │ 20/07  07:30 │ ABC1D23 · Frota 08 │ 🟡 RESTRIÇÃO │📷3│
  │ 20/07  06:45 │ DEF2G34 · Frota 12 │ 🟢 APROVADO  │   │
  │ 19/07  17:20 │ GHI3J45 · Frota 21 │ 🔴 REPROVADO │📷5│
  └──────────────────────────────────────────────────────┘
```

**Filtros disponíveis** (para achar o que você precisa):

- **Placa ou frota** — todo o histórico de um caminhão específico;
- **Período** — de uma data até outra;
- **Situação** — só os reprovados, por exemplo;
- **Busca livre** — procura nas observações.

Toque em qualquer linha para abrir o checklist completo: todos os itens, observações, fotos
ampliadas, quem preencheu e quando.

> 💡 **Uso mais comum:** antes de liberar um caminhão, filtre pela placa e veja se o último
> checklist deixou alguma pendência em aberto.

### Corrigir um checklist já salvo

Errou o KM, marcou um item sem querer ou esqueceu uma observação? Dá para corrigir.

1. Abra o checklist pelo **Histórico**.
2. Toque em **✎ Editar**.
3. A mesma tela do checklist abre, só que **já preenchida** com o que foi salvo.
4. Corrija o que precisar e toque em **Salvar alterações**.

**Quem pode editar:**

- **Você** pode corrigir os checklists que **você mesmo** preencheu;
- o **administrador** pode corrigir qualquer um.

Se o botão **Editar** não aparecer, o checklist é de outra pessoa — peça ao administrador.

**Sobre as fotos na edição:**

- as fotos já salvas aparecem sob o título *Fotos já salvas*;
- para tirar uma, toque no **✕** dela: ela fica marcada como *"Será removida ao salvar"*;
- mudou de ideia? Toque no **↺** e ela volta ao normal;
- a remoção só acontece de verdade quando você toca em **Salvar alterações**;
- para acrescentar fotos novas, use o botão **📷** normalmente.

> ⚠️ **A ficha registra a correção.** Depois de editar, o checklist passa a mostrar
> *"Última alteração"* com a data e a hora. O responsável pela inspeção continua sendo
> quem preencheu originalmente — mesmo quando quem corrigiu foi o administrador.

---

## 6. Imprimir ou salvar o PDF

Serve para arquivar, anexar em e-mail ou entregar na mão da oficina.

1. Abra o checklist que você quer (pelo Histórico).
2. Toque em **🖨 Imprimir**.
3. Abre a janela de impressão do navegador.

**Para imprimir no papel:** escolha a impressora e clique em *Imprimir*.

**Para salvar como PDF:**

- No **computador**: no campo *Destino* ou *Impressora*, escolha
  **"Salvar como PDF"** (ou "Microsoft Print to PDF") → *Salvar* → escolha a pasta.
- No **celular Android**: em *Selecionar impressora*, escolha **"Salvar como PDF"** →
  toque no ícone de download.
- No **iPhone**: toque em **Compartilhar** → **Imprimir** → pressione a prévia com dois dedos
  abrindo → **Compartilhar** → *Salvar em Arquivos*.

O PDF sai completo: cabeçalho com placa e KM, todos os itens com suas marcações, observações,
as fotos e a situação final.

---

## 7. Exportar para o Excel

Quando você precisa de uma planilha para somar, filtrar ou mandar para a diretoria.

1. Vá em **Histórico** (ou **Relatórios**).
2. Ajuste os filtros — período, placa. Só o que estiver filtrado será exportado.
3. Toque em **📥 Exportar para Excel**.
4. O arquivo `checklists.csv` é baixado.
5. Dê dois cliques nele: abre direto no Excel, com os acentos corretos.

A planilha traz uma linha por checklist e uma coluna para cada item conferido:

| Data | Hora | Placa | Frota | KM | Responsável | Situação | Pneus | Freio | ... |
|---|---|---|---|---|---|---|---|---|---|
| 20/07/2026 | 07:30 | ABC1D23 | 08 | 184320 | Maria Souza | RESTRIÇÃO | OK | NC | ... |

Há também colunas com as observações de cada item, as validades de CRLV e tacógrafo,
os dados da lona, as observações gerais e a quantidade de fotos.

> ⚠️ Se o Excel abrir tudo espremido em uma coluna só: você provavelmente abriu o arquivo por
> *Arquivo → Abrir* em vez de dar dois cliques. Feche e dê **dois cliques** no arquivo baixado.

---

## 8. Cadastrar um veículo novo

1. Menu **Veículos** → **+ Novo Veículo**.
2. Preencha:

| Campo | Obrigatório | Observação |
|---|---|---|
| **Placa** | **Sim** | Pode digitar com ou sem hífen, maiúscula ou minúscula — o sistema arruma. Aceita `ABC1234` e `ABC1D23` |
| Frota | Não | O número interno da empresa. Ajuda muito na busca |
| Modelo | Não | Ex.: Constellation 24.280 |
| Marca | Não | Ex.: Volkswagen |
| Ano | Não | Ano do veículo |
| Tipo de carroceria | Não | Baú, graneleiro, carga seca, tanque... |
| **Possui lona** | — | Marque **Sim** se o veículo trabalha com lona |
| Observações | Não | Qualquer detalhe útil |

3. Toque em **SALVAR**.

**Se aparecer "Já existe um veículo com esta placa":** o caminhão já está cadastrado.
Procure por ele na lista — pode estar **inativo**. Nesse caso, abra o cadastro e reative.

### Tirar um veículo de circulação

Abra o veículo e toque em **Desativar**. Ele **não é apagado**: some da lista de escolha ao
criar um checklist novo, mas todo o histórico dele continua guardado e consultável. Se voltar
à frota, é só reativar.

---

## 9. Trocar a sua senha

Faça isso **hoje**, se você ainda está usando a senha que lhe entregaram.

1. Toque no seu nome, no canto superior direito.
2. Escolha **Alterar senha**.
3. Digite a senha atual e a nova (mínimo 6 caracteres).
4. Toque em **SALVAR**.

**Escolhendo uma senha melhor:**

- ✅ Uma frase que só você lembra: `PatioAzul2026!`
- ❌ Não use: `123456`, `admin123`, a sua data de nascimento, a placa de um caminhão.

Esqueceu a senha? Só o administrador do sistema consegue definir uma nova para você.
Ninguém consegue "descobrir" a antiga — nem ele.

---

## 10. Auditoria: quem fez o quê (administrador)

> Esta tela só aparece para quem tem perfil **Administrador**.

No menu, abra **Auditoria**. É a memória do sistema: toda entrada, cadastro,
edição e exclusão fica registrada com **usuário, data, hora e endereço de rede**.

**Para que serve na prática:**

- *"Quem liberou aquele caminhão com o freio em não conformidade, e a que horas?"* —
  a linha `Criou · Checklist nº 4` mostra o nome, o horário e a decisão registrada.
- *"Alguém andou tentando entrar na minha conta?"* — filtre por
  **Tentativa de login falhou**. Se aparecerem várias seguidas, alguém está
  tentando adivinhar uma senha.
- *"Quem apagou aquele checklist?"* — filtre por **Excluiu**.

**Como usar:** os filtros do topo combinam entre si. Escolha a ação, o objeto, o
usuário e o período; a busca livre procura por nome, e-mail, placa ou IP —
inclusive dentro dos detalhes de cada registro. Clicando em `Checklist nº ...`
você vai direto para a ficha.

**As cores dos rótulos:**

| Cor | Significa |
|---|---|
| 🔵 Azul | Ação normal do dia a dia (entrou, criou, editou) |
| 🟡 Amarelo | Merece atenção (desativou alguém, trocou senha) |
| 🔴 Vermelho | Merece conferência (login falhou, bloqueio, exclusão) |

> **Ninguém apaga esta trilha — nem o administrador.** O sistema não tem tela nem
> comando para editar ou excluir um registro de auditoria; ele só escreve e lê.
> É isso que faz o registro valer como prova depois.

Quando o usuário aparece como *"não identificado"*, é porque ninguém estava
logado no momento (o caso das tentativas de login que falharam) ou porque a
conta foi excluída depois do fato — o registro permanece de qualquer forma.

---

## 11. Dúvidas frequentes

**Salvei o checklist com um item errado. E agora?**
Abra pelo Histórico e toque em **Editar**. Você pode alterar os checklists que **você mesmo**
criou. Os de outras pessoas, só o administrador altera.

**Preciso de internet para usar?**
Não. Só do **Wi-Fi da empresa**, para o celular alcançar o computador do escritório.
Sem internet, o sistema funciona normalmente.

**Posso preencher pelo celular com o computador desligado?**
Não. O computador do escritório é quem guarda tudo — ele precisa estar ligado com o
`INICIAR.bat` aberto.

**Duas pessoas podem preencher ao mesmo tempo?**
Sim, sem problema. Cada uma com o seu login, em celulares diferentes.

**Marquei NC sem querer. Como desmarco?**
Toque de novo na opção correta (OK ou NA). Enquanto não salvar, mude à vontade.

**Fui embora e não terminei o checklist. Perdi tudo?**
Se não salvou, sim. Salve mesmo incompleto: os itens não conferidos ficam como **pendentes**
e você edita depois.

**O caminhão foi reprovado. O que eu faço?**
Reprovado é o que **você** respondeu em "Você aprova o veículo?". Avise imediatamente o
responsável pela frota. O checklist já está registrado com foto, data, hora e o seu nome.

**Marquei NC num item crítico, mas o problema foi resolvido na hora. Posso aprovar?**
Pode. A sua decisão manda: o checklist fica como **RESTRIÇÃO**, não como reprovado. Escreva
nas observações gerais o que foi feito — é o que explica a liberação para quem olhar depois.

**A foto não subiu.**
Geralmente é tamanho: o máximo é 5 MB por foto. Reduza a resolução da câmera nas
configurações do celular e tente de novo. Confira também se não passou de 20 fotos no checklist.

**Apareceu "Sessão expirada".**
Normal — o login vale 12 horas. É só entrar de novo. Se estava preenchendo, salve antes de sair.

---

## Resumo rápido para colar na parede

```
  1. Abrir o sistema  →  Entrar com o SEU login
  2. Novo Checklist   →  Escolher a placa
  3. Data, hora e KM do painel
  4. Item por item:  ✅ OK   ❌ NC   ➖ NA
  5. Marcou NC?  →  Escrever o que há + TIRAR FOTO
  6. Lona: BOA ou RUIM
  7. Observações gerais
  8. DECISÃO:  ✓ Aprovo   ou   ✕ Não aprovo   ← quem manda é você
  9. SALVAR  →  ver o resultado

  ✓ Aprovo + tudo certo   →  🟢 APROVADO   = liberado
  ✓ Aprovo + tem NC       →  🟡 RESTRIÇÃO  = liberado, avisar a manutenção
  ✕ Não aprovo            →  🔴 REPROVADO  = NÃO SAI. Avisar o responsável na hora
```
