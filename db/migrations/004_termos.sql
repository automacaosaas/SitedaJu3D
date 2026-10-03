-- Aceite dos Termos de Uso: qual versão (TERMS_VERSION em api/_lib/legal.js) e quando. Na conta, ao criar o cadastro
-- (a tela avisa que criar a conta é concordar); no pedido, pela caixa obrigatória do checkout.

ALTER TABLE customers ADD COLUMN terms_version VARCHAR(20) NULL, ADD COLUMN terms_accepted_at DATETIME(3) NULL;

ALTER TABLE orders ADD COLUMN terms_version VARCHAR(20) NULL, ADD COLUMN terms_accepted_at DATETIME(3) NULL;
