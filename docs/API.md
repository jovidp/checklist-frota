# Contrato da API — Sistema de Checklist de Caminhões

> Documento normativo. Backend e frontend **devem** seguir exatamente estes formatos.

- Base: `http://localhost:3000`
- Prefixo da API: `/api`
- Todo corpo de requisição e resposta é `application/json; charset=utf-8`
- Autenticação: header `Authorization: Bearer <token>` (JWT HS256)
- Fotos servidas em `/uploads/<arquivo>`
- Frontend estático servido em `/`

## Convenções de resposta

Sucesso:
```json
{ "ok": true, "dados": <objeto|array>, "paginacao": { "pagina":1, "limite":20, "total":57, "paginas":3 } }
```
`paginacao` só existe em listagens paginadas.

Erro:
```json
{ "ok": false, "erro": { "codigo": "VALIDACAO", "mensagem": "Placa é obrigatória", "campos": { "placa": "obrigatório" } } }
```

Códigos de erro e status HTTP:

| codigo | HTTP | quando |
|---|---|---|
| `VALIDACAO` | 400 | payload inválido |
| `NAO_AUTENTICADO` | 401 | token ausente/inválido/expirado |
| `SEM_PERMISSAO` | 403 | perfil insuficiente |
| `SENHA_PROVISORIA` | 403 | senha provisória ainda não trocada (só `/api/auth` liberado) |
| `NAO_ENCONTRADO` | 404 | recurso inexistente |
| `CONFLITO` | 409 | duplicidade (ex.: placa/e-mail já cadastrado) |
| `PAYLOAD_GRANDE` | 413 | corpo ou foto acima do limite |
| `MUITAS_TENTATIVAS` | 429 | excesso de tentativas de login (header `Retry-After` em segundos) |
| `ERRO_INTERNO` | 500 | falha não tratada |

## Domínio

- **Status de item**: `OK` (conforme) · `NC` (não conforme) · `NA` (não se aplica) · `PEND` (não informado)
- **Decisão final** (`aprovacao`): `APROVADO` | `REPROVADO` — a palavra do responsável sobre liberar
  ou não o veículo. **Obrigatória** no POST e no PUT (400 `VALIDACAO` se ausente ou inválida).
  Vem `null` apenas nos registros anteriores à criação do campo.
- **Status do checklist** (derivado **no servidor**, nunca aceito do cliente): a `aprovacao` manda,
  as não conformidades apenas qualificam.
  - `REPROVADO` — `aprovacao = 'REPROVADO'`
  - `RESTRICAO` — `aprovacao = 'APROVADO'` e existe algum `NC` (crítico ou não) **ou** lona `RUIM`
  - `APROVADO` — `aprovacao = 'APROVADO'`, sem `NC` e lona OK (ou sem lona)

  Aprovar um veículo com item crítico em `NC` (consertado na hora) devolve `RESTRICAO`, nunca
  `REPROVADO`: o cálculo não derruba a decisão de quem inspecionou. O flag `critico` do catálogo
  serve para **alertar** o usuário antes da decisão, não para vetá-la.

  Sem `aprovacao` (registros antigos) vale a regra automática anterior: crítico em `NC` →
  `REPROVADO`; algum `NC` ou lona `RUIM` → `RESTRICAO`; senão `APROVADO`.
- **Perfis**: `admin` (tudo) · `operador` (cria/edita os próprios checklists; não gerencia usuários)
- **Não existe campo "motorista"** — o responsável é sempre o usuário autenticado (`usuario_id`).

---

## 1. Autenticação — `/api/auth`

### `POST /api/auth/login` — público
```json
{ "email": "admin@transporte.com", "senha": "..." }
```
→ `200`
```json
{ "ok": true, "dados": { "token": "eyJ...", "expiraEm": "2026-07-21T12:00:00.000Z",
  "usuario": { "id":1, "nome":"Administração", "email":"admin@transporte.com",
               "perfil":"admin", "senhaProvisoria": false } } }
```
`senhaProvisoria: true` significa que a senha veio da carga inicial: o token é válido,
mas toda rota fora de `/api/auth` responde `403` `SENHA_PROVISORIA` até a troca em
`POST /api/auth/senha`, que zera a marca.

→ `401` `NAO_AUTENTICADO` se credenciais inválidas ou usuário inativo.
→ `429` `MUITAS_TENTATIVAS` após 5 falhas em 15 minutos para o mesmo e-mail + IP;
o header `Retry-After` traz os segundos restantes e um login bem-sucedido zera a contagem.

### `GET /api/auth/eu` — autenticado
→ `{ "ok": true, "dados": { "id":1, "nome":"...", "email":"...", "perfil":"admin", "senhaProvisoria": false } }`

### `POST /api/auth/senha` — autenticado
`{ "senhaAtual": "...", "senhaNova": "..." }` → `{ "ok": true, "dados": { "alterada": true } }`
(`senhaNova` mínimo 6 caracteres)

---

## 2. Usuários — `/api/usuarios` (somente `admin`)

| método | rota | descrição |
|---|---|---|
| GET | `/api/usuarios` | lista todos |
| POST | `/api/usuarios` | `{ nome, email, senha, perfil }` |
| PUT | `/api/usuarios/:id` | `{ nome?, email?, senha?, perfil?, ativo? }` |
| DELETE | `/api/usuarios/:id` | desativa (soft delete); 409 se for o último admin ativo ou o próprio usuário |

O objeto usuário **nunca** inclui `senha_hash`.

---

## 3. Veículos — `/api/veiculos` (autenticado)

### `GET /api/veiculos?busca=&ativo=1&pagina=1&limite=50`
→ lista de:
```json
{ "id":1, "placa":"ABC1D23", "frota":"08", "modelo":"Constellation 24.280", "marca":"VW",
  "ano":2019, "tipo_carroceria":"Baú", "possui_lona":true, "observacoes":null, "ativo":true,
  "criado_em":"2026-07-20 09:00:00", "total_checklists": 12, "ultimo_checklist": "2026-07-19" }
```
`possui_lona` e `ativo` são **booleanos** no JSON (o banco guarda 0/1 — a conversão é do backend).

### `POST /api/veiculos`
```json
{ "placa":"ABC1D23", "frota":"08", "modelo":"...", "marca":"...", "ano":2019,
  "tipo_carroceria":"Baú", "possui_lona":true, "observacoes":"" }
```
- `placa` obrigatória; normalizada para **maiúsculas sem hífen/espaço**; aceita `AAA9999` ou Mercosul `AAA9A99`
- 409 `CONFLITO` se a placa já existir

### `GET /api/veiculos/:id` · `PUT /api/veiculos/:id` · `DELETE /api/veiculos/:id`
DELETE é soft delete (`ativo = 0`). Veículo com checklists **não** pode ser removido fisicamente.

---

## 4. Catálogo de itens — `/api/itens` (autenticado)

`GET /api/itens` → itens ativos ordenados por `ordem`:
```json
{ "chave":"pneus", "nome":"Pneus", "dica":"Calibragem, sulco, cortes e estepe",
  "categoria":"inspecao", "critico":true, "ordem":1 }
```

---

## 5. Checklists — `/api/checklists` (autenticado)

### `GET /api/checklists?placa=&veiculo_id=&de=&ate=&status=&busca=&pagina=1&limite=20`
Lista resumida (view `vw_checklists`), mais recentes primeiro, **com** `paginacao`:
```json
{ "id":10, "data":"2026-07-20", "hora":"07:30", "km":184320, "status":"RESTRICAO",
  "veiculo": { "id":1, "placa":"ABC1D23", "frota":"08", "modelo":"..." },
  "responsavel": { "id":1, "nome":"Administração" },
  "resumo": { "ok":12, "nc":1, "na":1, "pendente":0 },
  "total_fotos": 3, "criado_em":"2026-07-20 07:35:00" }
```

### `POST /api/checklists`
```json
{
  "veiculo_id": 1,
  "data": "2026-07-20",
  "hora": "07:30",
  "km": 184320,
  "crlv_validade": "2026-12-31",
  "tacografo_validade": "2027-03-15",
  "lona_possui": true,
  "lona_condicao": "BOA",
  "lona_obs": "",
  "obs_geral": "Veículo liberado.",
  "aprovacao": "APROVADO",
  "itens": [
    { "chave":"pneus", "status":"OK",  "observacao":"" },
    { "chave":"freio", "status":"NC",  "observacao":"Pedal com curso longo" }
  ],
  "fotos": [
    { "item_chave":"freio", "legenda":"Pedal de freio", "dados":"data:image/jpeg;base64,/9j/4AAQ..." }
  ]
}
```
Regras do servidor:
- `veiculo_id` deve existir e estar ativo → senão 404/400
- `aprovacao` é obrigatória (`APROVADO` ou `REPROVADO`) → senão 400 `VALIDACAO` com `campos.aprovacao`
- Itens não enviados são gravados como `PEND`; chaves desconhecidas → 400 `VALIDACAO`
- `status`, `total_ok/nc/na/pendente` são **calculados**; se vierem no corpo, são ignorados
- `usuario_id` = usuário do token
- `lona_condicao` só é gravada se `lona_possui = true`; caso contrário vira `null`
- `fotos` é opcional; ver limites na seção 6
- Tudo é gravado em **uma transação**: se qualquer foto falhar, nada é persistido

→ `201` com o checklist completo (mesmo formato do GET por id).

### `GET /api/checklists/:id` — objeto completo
```json
{ "id":10, "data":"2026-07-20", "hora":"07:30", "km":184320, "status":"RESTRICAO",
  "crlv_validade":"2026-12-31", "tacografo_validade":"2027-03-15",
  "lona_possui":true, "lona_condicao":"BOA", "lona_obs":"",
  "obs_geral":"...",
  "veiculo": { "id":1, "placa":"ABC1D23", "frota":"08", "modelo":"...", "marca":"...", "tipo_carroceria":"Baú" },
  "responsavel": { "id":1, "nome":"Administração", "email":"..." },
  "resumo": { "ok":12, "nc":1, "na":1, "pendente":0 },
  "itens": [ { "chave":"pneus", "nome":"Pneus", "dica":"...", "categoria":"inspecao",
               "critico":true, "ordem":1, "status":"OK", "observacao":"",
               "fotos":[ { "id":3, "url":"/uploads/abc.jpg", "legenda":"..." } ] } ],
  "fotos": [ { "id":3, "item_chave":"freio", "url":"/uploads/abc.jpg", "legenda":"Pedal de freio",
               "mime":"image/jpeg", "tamanho":184213, "criado_em":"..." } ],
  "criado_em":"...", "atualizado_em":"..." }
```
`itens` traz **todos** os itens ativos do catálogo (mesmo os `PEND`), na ordem do catálogo, cada um com suas fotos.

### `PUT /api/checklists/:id`
Mesmo corpo do POST (sem `fotos` — fotos têm rotas próprias). Recalcula status e contadores.
`operador` só edita checklists criados por ele mesmo → senão 403 `SEM_PERMISSAO`.

### `DELETE /api/checklists/:id`
Remove o checklist, seus itens, suas fotos (registros **e** arquivos em disco). Somente `admin`.

---

## 6. Fotos

### `POST /api/checklists/:id/fotos` — autenticado
```json
{ "item_chave": "freio", "legenda": "Pedal de freio", "dados": "data:image/jpeg;base64,/9j/..." }
```
- `dados`: data URL **ou** base64 puro
- Tipos aceitos: `image/jpeg`, `image/png`, `image/webp`
- Tamanho máx. por foto: **5 MB** decodificados (`MAX_FOTO_MB`)
- Máx. de fotos por checklist: **20** (`MAX_FOTOS_CHECKLIST`) → 400 `VALIDACAO` ao exceder
- `item_chave` opcional; se informado deve existir no catálogo
- Nome do arquivo gerado pelo servidor (`randomUUID` + extensão). **Nunca** confiar em nome vindo do cliente.
- O limite de corpo do Express deve acomodar as fotos (`50mb`)

→ `201` `{ "ok":true, "dados": { "id":3, "url":"/uploads/....jpg", "item_chave":"freio", ... } }`

### `GET /api/checklists/:id/fotos` → lista as fotos do checklist
### `DELETE /api/fotos/:id` → remove registro + arquivo do disco → `{ "ok":true, "dados":{ "removida":true } }`

---

## 7. Relatórios — `/api/relatorios` (autenticado)

### `GET /api/relatorios/resumo?de=&ate=`
```json
{ "periodo": { "de":"2026-07-01", "ate":"2026-07-20" },
  "total_checklists": 57, "aprovados": 40, "restricoes": 12, "reprovados": 5,
  "veiculos_ativos": 8, "total_nao_conformidades": 23,
  "por_dia": [ { "data":"2026-07-19", "total":4 } ],
  "por_status": [ { "status":"APROVADO", "total":40 } ] }
```

### `GET /api/relatorios/nao-conformidades?de=&ate=&limite=10`
Ranking dos itens que mais reprovam:
```json
[ { "chave":"pneus", "nome":"Pneus", "critico":true, "total":9 } ]
```

### `GET /api/relatorios/veiculos?de=&ate=`
Por veículo: `{ "veiculo_id":1, "placa":"ABC1D23", "frota":"08", "total":12, "reprovados":2, "nc":7, "ultimo":"2026-07-19" }`

### `GET /api/relatorios/alertas`
Vencimentos de documentos nos próximos 30 dias, com base no **último** checklist de cada veículo:
`[ { "veiculo_id":1, "placa":"ABC1D23", "documento":"CRLV", "validade":"2026-08-05", "dias":16, "vencido":false } ]`

---

## 8. Exportação

### `GET /api/exportar/csv?de=&ate=&placa=` — autenticado
`Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="checklists.csv"`
Separador `;`, com **BOM UTF-8** (compatível com Excel pt-BR), datas em `DD/MM/AAAA`.
Colunas: Data; Hora; Placa; Frota; KM; Responsável; Situação; *(uma coluna por item do catálogo)*; *(uma coluna "Obs. <item>" por item)*; Validade CRLV; Validade Tacógrafo; Possui lona; Condição da lona; Obs. lona; Observações gerais; Qtd. fotos.

---

## 9. Auditoria — `/api/auditoria` (somente `admin`)

Trilha de quem fez o quê. **Somente leitura**: não existe rota para criar, editar
ou apagar registro de auditoria — POST/PUT/DELETE devolvem 404. Uma trilha que a
própria API consegue reescrever não serve como prova.

### `GET /api/auditoria?busca=&acao=&entidade=&usuario_id=&de=&ate=&pagina=1&limite=50`

Mais recentes primeiro. `busca` varre nome, e-mail, ação, entidade, IP e o
conteúdo do `detalhe`. `de`/`ate` filtram pelo dia (`AAAA-MM-DD`); data mal
formatada → 400 `VALIDACAO`.

```json
{ "ok": true, "dados": [
  { "id": 52, "acao": "criar", "entidade": "checklist", "entidade_id": 5,
    "detalhe": { "veiculo_id": 3, "placa": "BRA2E19", "status": "RESTRICAO", "aprovacao": "APROVADO" },
    "ip": "127.0.0.1", "criado_em": "2026-07-22 08:33:18",
    "usuario": { "id": 1, "nome": "Rafael Mendes", "email": "admin@transporte.com" } }
], "paginacao": { "pagina":1, "limite":50, "total":52, "paginas":2 } }
```

- `detalhe` volta como **objeto** já desserializado (era JSON em texto no banco).
  Se o registro estiver malformado, volta a string crua em vez de derrubar a lista.
- `usuario` é `null` quando ninguém estava autenticado (`login-falha`,
  `login-bloqueado`) ou quando a conta foi excluída depois do fato
  (`ON DELETE SET NULL`).

Ações gravadas hoje: `login`, `login-falha`, `login-bloqueado`, `alterar-senha`,
`criar`, `atualizar`, `desativar`, `remover`, `adicionar_foto`, `remover_foto`,
`EXPORTAR`. A grafia é inconsistente por motivos históricos — o painel traduz na
exibição, sem reescrever o que já foi gravado.

### `GET /api/auditoria/opcoes`

Valores que existem de fato na trilha, para montar os filtros sem opção morta:

```json
{ "ok": true, "dados": {
  "acoes":     [ { "valor": "login", "total": 16 } ],
  "entidades": [ { "valor": "checklist", "total": 21 } ],
  "usuarios":  [ { "id": 1, "nome": "Rafael Mendes", "total": 40 } ],
  "total": 52 } }
```

---

## 10. Saúde

`GET /api/saude` — **público** → `{ "ok":true, "dados": { "status":"online", "versao":"1.0.0", "banco":"conectado", "hora":"..." } }`

---

## Variáveis de ambiente (`.env`)

| variável | padrão | uso |
|---|---|---|
| `PORT` | `3000` | porta HTTP |
| `JWT_SEGREDO` | *(gerado e persistido em `data/.segredo` se ausente)* | assinatura do token |
| `JWT_EXPIRA_HORAS` | `12` | validade do token |
| `DB_ARQUIVO` | `data/checklist.db` | caminho do SQLite |
| `UPLOAD_DIR` | `data/uploads` | pasta das fotos |
| `MAX_FOTO_MB` | `5` | tamanho máximo por foto |
| `MAX_FOTOS_CHECKLIST` | `20` | fotos por checklist |
| `ADMIN_EMAIL` | `admin@transporte.com` | admin criado pelo seed |
| `ADMIN_SENHA` | *(sem padrão: o seed gera uma senha aleatória provisória e a exibe uma única vez)* | senha inicial do admin |
