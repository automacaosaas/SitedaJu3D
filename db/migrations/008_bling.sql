-- Bling, o emissor de NF-e escolhido pelo contador. A Ju conecta a conta do Bling uma vez pelo painel (autorização
-- OAuth); o site guarda os tokens criptografados com a DATA_KEY e renova sozinho. integrations.paused_reason pausa a
-- emissão quando algo precisa de gente (por exemplo, o Bling respondeu em produção num site que esperava homologação).
-- invoices.provider_id é o código da nota dentro do emissor: uma nova tentativa usa a mesma nota, nunca cria outra.

ALTER TABLE invoices
  ADD COLUMN provider_id VARCHAR(40) NULL AFTER provider;

CREATE TABLE integrations (
  name VARCHAR(20) NOT NULL PRIMARY KEY,
  tokens_enc BLOB NULL,
  access_expires_at DATETIME(3) NULL,
  refresh_expires_at DATETIME(3) NULL,
  connected_by VARCHAR(180) NULL,
  connected_at DATETIME(3) NULL,
  refreshed_at DATETIME(3) NULL,
  paused_reason VARCHAR(300) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
