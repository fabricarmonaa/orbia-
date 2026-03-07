UPDATE plans SET limits_json = limits_json || '{"max_branches": 5}'::jsonb WHERE plan_code = 'ESCALA';
