-- Contas: clientes, sessões, códigos por e-mail e limites de tentativas. MySQL 8 ou MariaDB 10.5+ (Hostinger).
-- CPF e telefone ficam criptografados (AES-256-GCM, chave DATA_KEY); cpf_index é um HMAC que garante um CPF por conta
-- sem guardar o número aberto. Aplicado automaticamente por api/_lib/migrate.js; nunca editar depois de publicado:
-- mudanças vão num arquivo novo (002_...sql).

CREATE TABLE customers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(180) NOT NULL,
  email_verified_at DATETIME(3) NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT '',
  first_name VARCHAR(60) NULL,
  last_name VARCHAR(100) NULL,
  password_hash VARCHAR(255) NULL,
  cpf_enc VARBINARY(96) NULL,
  cpf_index BINARY(32) NULL,
  phone_enc VARBINARY(96) NULL,
  company_cnpj CHAR(14) NULL,
  company_name VARCHAR(150) NULL,
  company_ie VARCHAR(20) NULL,
  marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  marketing_consent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_customers_email (email),
  UNIQUE KEY uq_customers_cpf (cpf_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  KEY ix_sessions_customer (customer_id),
  CONSTRAINT fk_sessions_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_challenges (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(180) NOT NULL,
  purpose VARCHAR(16) NOT NULL,
  code_hash BINARY(32) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  verified_at DATETIME(3) NULL,
  grant_hash BINARY(32) NULL,
  grant_expires_at DATETIME(3) NULL,
  used_at DATETIME(3) NULL,
  KEY ix_challenges_email (email, created_at),
  UNIQUE KEY uq_challenges_grant (grant_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
  bucket VARCHAR(200) NOT NULL,
  window_start BIGINT NOT NULL,
  hits INT UNSIGNED NOT NULL,
  PRIMARY KEY (bucket, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
