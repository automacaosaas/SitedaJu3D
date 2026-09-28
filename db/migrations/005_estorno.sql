-- Estorno automático: quando a Ju recusa um pedido pago, o servidor pede ao Mercado Pago o reembolso total da order
-- (POST /v1/orders/{id}/refund). refund_state: requested (pedido feito, aguardando confirmação), refunded (o Mercado Pago
-- confirmou) ou failed (não deu; refund_error guarda só o código do erro e a Ju pode tentar de novo ou estornar pelo
-- painel do Mercado Pago). Um estorno feito direto no Mercado Pago também chega aqui pelo webhook.

ALTER TABLE orders
  ADD COLUMN refund_state VARCHAR(16) NULL AFTER decline_reason,
  ADD COLUMN refund_id VARCHAR(64) NULL AFTER refund_state,
  ADD COLUMN refunded_at DATETIME(3) NULL AFTER refund_id,
  ADD COLUMN refund_error VARCHAR(120) NULL AFTER refunded_at;
