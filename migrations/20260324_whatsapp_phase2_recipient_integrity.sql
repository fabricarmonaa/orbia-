ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS recipient_phone_canonical varchar(40),
  ADD COLUMN IF NOT EXISTS recipient_wa_id varchar(80),
  ADD COLUMN IF NOT EXISTS sandbox_recipient_override boolean NOT NULL DEFAULT false;

UPDATE whatsapp_conversations
SET recipient_phone_canonical = regexp_replace(coalesce(customer_phone, ''), '\\D', '', 'g')
WHERE recipient_phone_canonical IS NULL;

ALTER TABLE whatsapp_conversations
  ALTER COLUMN recipient_phone_canonical SET NOT NULL;
