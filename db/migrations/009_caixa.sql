-- Fluxo de caixa do Painel da Ju. As vendas não ficam aqui: saem dos pedidos pagos a cada consulta (api/_lib/cash.js).
-- cash_entries: entradas e despesas que a Ju lança à mão (kind = entrada ou saida) e os ajustes de saldo
-- (category = ajuste), que só mexem no saldo. bills: contas a pagar; paid_on preenchido = paga naquele dia, e a conta
-- vira uma saída do caixa; locked_at preenchido = status trancado (não muda nem é excluída até destrancar). Datas são dias do calendário (DATE), no horário de Brasília.

CREATE TABLE cash_entries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  kind VARCHAR(8) NOT NULL,
  category VARCHAR(20) NOT NULL,
  description VARCHAR(120) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  occurred_on DATE NOT NULL,
  created_by VARCHAR(180) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_cash_entries_day (occurred_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bills (
  id CHAR(36) NOT NULL PRIMARY KEY,
  description VARCHAR(120) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  due_on DATE NOT NULL,
  paid_on DATE NULL,
  locked_at DATETIME(3) NULL,
  created_by VARCHAR(180) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_bills_due (due_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
