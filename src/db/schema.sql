-- ============================================================================
--  CHECKLIST DE CAMINHÕES — Esquema do banco de dados (SQLite)
--  Executado por src/db/migrate.js. Todas as instruções são idempotentes.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- USUÁRIOS  (quem preenche o checklist — administração do transporte)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT    NOT NULL,
  perfil      TEXT    NOT NULL DEFAULT 'operador'
              CHECK (perfil IN ('admin','operador')),
  ativo       INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  -- 1 = senha provisória (gerada pela carga inicial). Enquanto valer 1 o
  -- usuário só pode trocar a senha; o resto da API fica bloqueado.
  senha_provisoria INTEGER NOT NULL DEFAULT 0 CHECK (senha_provisoria IN (0,1)),
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT  NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------------
-- VEÍCULOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veiculos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  placa         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  frota         TEXT,
  modelo        TEXT,
  marca         TEXT,
  ano           INTEGER,
  tipo_carroceria TEXT,
  possui_lona   INTEGER NOT NULL DEFAULT 0 CHECK (possui_lona IN (0,1)),
  observacoes   TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa);
CREATE INDEX IF NOT EXISTS idx_veiculos_ativo ON veiculos(ativo);

-- ---------------------------------------------------------------------------
-- CATÁLOGO DE ITENS  (o que é inspecionado — configurável)
--   categoria: 'inspecao' | 'documentacao'
--   critico=1  => uma não conformidade REPROVA o veículo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itens_catalogo (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chave     TEXT    NOT NULL UNIQUE,
  nome      TEXT    NOT NULL,
  dica      TEXT,
  categoria TEXT    NOT NULL CHECK (categoria IN ('inspecao','documentacao')),
  critico   INTEGER NOT NULL DEFAULT 0 CHECK (critico IN (0,1)),
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

-- ---------------------------------------------------------------------------
-- CHECKLISTS  (cabeçalho)
--   Não há campo "motorista": o responsável é sempre o usuário logado
--   (administração do transporte), registrado em usuario_id.
--   status: APROVADO | RESTRICAO | REPROVADO — derivado de `aprovacao`
--           (a decisão manda) somada às não conformidades. Ver lib/status.js.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklists (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  veiculo_id        INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
  usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data              TEXT    NOT NULL,              -- YYYY-MM-DD
  hora              TEXT,                          -- HH:MM
  km                INTEGER,
  status            TEXT    NOT NULL DEFAULT 'APROVADO'
                    CHECK (status IN ('APROVADO','RESTRICAO','REPROVADO')),

  -- Decisão final de quem inspecionou: libera ou não o veículo. É a palavra
  -- que vale — o `status` acima é derivado dela. Aprovou, o checklist não sai
  -- reprovado; havendo não conformidade, sai como RESTRICAO.
  -- Fica nulo apenas nos registros anteriores à criação deste campo, e só
  -- nesses o `status` volta a ser calculado só pelos itens.
  aprovacao         TEXT CHECK (aprovacao IN ('APROVADO','REPROVADO') OR aprovacao IS NULL),

  -- documentação (datas de validade)
  crlv_validade      TEXT,
  tacografo_validade TEXT,

  -- lona
  lona_possui   INTEGER NOT NULL DEFAULT 0 CHECK (lona_possui IN (0,1)),
  lona_condicao TEXT CHECK (lona_condicao IN ('BOA','RUIM') OR lona_condicao IS NULL),
  lona_obs      TEXT,

  obs_geral     TEXT,

  -- contadores desnormalizados (calculados no servidor)
  total_ok       INTEGER NOT NULL DEFAULT 0,
  total_nc       INTEGER NOT NULL DEFAULT 0,
  total_na       INTEGER NOT NULL DEFAULT 0,
  total_pendente INTEGER NOT NULL DEFAULT 0,

  criado_em     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_checklists_data    ON checklists(data DESC);
CREATE INDEX IF NOT EXISTS idx_checklists_veiculo ON checklists(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_checklists_status  ON checklists(status);
CREATE INDEX IF NOT EXISTS idx_checklists_usuario ON checklists(usuario_id);

-- ---------------------------------------------------------------------------
-- ITENS RESPONDIDOS DE CADA CHECKLIST
--   status: OK | NC | NA | PEND
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_itens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  item_chave   TEXT    NOT NULL REFERENCES itens_catalogo(chave) ON DELETE RESTRICT,
  status       TEXT    NOT NULL DEFAULT 'PEND'
               CHECK (status IN ('OK','NC','NA','PEND')),
  observacao   TEXT,
  UNIQUE (checklist_id, item_chave)
);

CREATE INDEX IF NOT EXISTS idx_ci_checklist ON checklist_itens(checklist_id);
CREATE INDEX IF NOT EXISTS idx_ci_status    ON checklist_itens(status);

-- ---------------------------------------------------------------------------
-- FOTOS  (anexadas ao checklist; item_chave opcional = foto do item específico)
--   arquivo = nome do arquivo salvo em data/uploads/
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fotos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id  INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  item_chave    TEXT REFERENCES itens_catalogo(chave) ON DELETE SET NULL,
  arquivo       TEXT    NOT NULL,
  nome_original TEXT,
  mime          TEXT    NOT NULL,
  tamanho       INTEGER NOT NULL DEFAULT 0,
  legenda       TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_fotos_checklist ON fotos(checklist_id);
CREATE INDEX IF NOT EXISTS idx_fotos_item      ON fotos(checklist_id, item_chave);

-- ---------------------------------------------------------------------------
-- LOG DE AUDITORIA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  acao       TEXT NOT NULL,
  entidade   TEXT NOT NULL,
  entidade_id INTEGER,
  detalhe    TEXT,
  ip         TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(criado_em DESC);

-- ---------------------------------------------------------------------------
-- VIEW de consulta rápida do histórico
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_checklists;
CREATE VIEW vw_checklists AS
SELECT
  c.id, c.data, c.hora, c.km, c.status, c.aprovacao,
  c.total_ok, c.total_nc, c.total_na, c.total_pendente,
  c.lona_possui, c.lona_condicao,
  c.criado_em,
  v.id AS veiculo_id, v.placa, v.frota, v.modelo,
  u.id AS usuario_id, u.nome AS responsavel,
  (SELECT COUNT(*) FROM fotos f WHERE f.checklist_id = c.id) AS total_fotos
FROM checklists c
JOIN veiculos v ON v.id = c.veiculo_id
JOIN usuarios u ON u.id = c.usuario_id;

-- ============================================================================
--  DADOS DE REFERÊNCIA — catálogo de itens inspecionados
-- ============================================================================
INSERT OR IGNORE INTO itens_catalogo (chave, nome, dica, categoria, critico, ordem) VALUES
  ('pneus',         'Pneus',                    'Calibragem, sulco, cortes e estepe',            'inspecao',      1,  1),
  ('lanternas',     'Lanternas',                'Dianteiras, traseiras e laterais',              'inspecao',      0,  2),
  ('setas',         'Setas',                    'Pisca-alerta e indicadores de direção',         'inspecao',      0,  3),
  ('luz_freio',     'Luz de freio',             'Inclusive brake-light',                         'inspecao',      1,  4),
  ('retrovisores',  'Retrovisores',             'Fixação, ajuste e integridade',                 'inspecao',      0,  5),
  ('limpadores',    'Limpadores de para-brisa', 'Palhetas e esguicho de água',                   'inspecao',      0,  6),
  ('oleo_motor',    'Óleo do motor',            'Nível na vareta',                               'inspecao',      0,  7),
  ('arrefecimento', 'Líquido de arrefecimento', 'Nível no reservatório',                         'inspecao',      0,  8),
  ('vazamentos',    'Vazamentos aparentes',     'Conforme = nenhum vazamento identificado',      'inspecao',      1,  9),
  ('freio',         'Freio',                    'Curso do pedal, pressão de ar, freio de mão',   'inspecao',      1, 10),
  ('buzina',        'Buzina',                   'Funcionamento e sonoridade',                    'inspecao',      0, 11),
  ('carroceria',    'Carroceria / Baú',         'Estrutura, portas, travas e assoalho',          'inspecao',      0, 12),
  ('crlv',          'CRLV',                     'Certificado de Registro e Licenciamento — dentro do prazo', 'documentacao', 1, 13),
  ('tacografo',     'Tacógrafo',                'Aferição válida (INMETRO) e registro em uso',   'documentacao',  1, 14);
