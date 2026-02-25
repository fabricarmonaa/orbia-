-- Update plan featuresJson and limitsJson with canonical keys
UPDATE plans SET
  features_json = '{"orders":true,"tracking":true,"cash_simple":true,"cash_sessions":false,"products":false,"branches":false,"fixed_expenses":false,"variable_expenses":false,"reports_advanced":false,"stt":false,"pos":false,"purchases":false,"cashiers":false,"sales_history":false,"customers":true,"ai":false,"attachments":false,"products_export":false,"tracking_custom_design":false,"tracking_external_links":false,"pdf_watermark":true,"margin_pricing":false,"excel_import":false,"custom_tos":false}',
  limits_json = '{"customers_max":50,"branches_max":0,"max_branches":0,"cashiers_max":0,"staff_max":0,"max_staff_users":0,"orders_month_max":-1,"max_orders_month":-1,"tracking_retention_min_hours":12,"tracking_retention_max_hours":24}'
WHERE plan_code = 'ECONOMICO';

UPDATE plans SET
  features_json = '{"orders":true,"tracking":true,"cash_simple":true,"cash_sessions":true,"products":true,"branches":true,"fixed_expenses":true,"variable_expenses":true,"reports_advanced":false,"stt":false,"pos":true,"purchases":true,"cashiers":true,"CASHIERS":true,"sales_history":true,"customers":true,"ai":false,"attachments":true,"products_export":true,"tracking_custom_design":false,"tracking_external_links":false,"pdf_watermark":false,"margin_pricing":true,"excel_import":true,"custom_tos":false}',
  limits_json = '{"customers_max":1000,"branches_max":1,"max_branches":1,"cashiers_max":2,"staff_max":10,"max_staff_users":10,"orders_month_max":-1,"max_orders_month":-1,"tracking_retention_min_hours":1,"tracking_retention_max_hours":168}'
WHERE plan_code = 'PROFESIONAL';

UPDATE plans SET
  features_json = '{"orders":true,"tracking":true,"cash_simple":true,"cash_sessions":true,"products":true,"branches":true,"fixed_expenses":true,"variable_expenses":true,"reports_advanced":true,"stt":true,"pos":true,"purchases":true,"cashiers":true,"CASHIERS":true,"sales_history":true,"customers":true,"ai":true,"attachments":true,"products_export":true,"tracking_custom_design":true,"tracking_external_links":true,"pdf_watermark":false,"margin_pricing":true,"excel_import":true,"custom_tos":true}',
  limits_json = '{"customers_max":5000,"branches_max":5,"max_branches":5,"cashiers_max":20,"staff_max":50,"max_staff_users":10,"orders_month_max":-1,"max_orders_month":-1,"tracking_retention_min_hours":1,"tracking_retention_max_hours":720}'
WHERE plan_code = 'ESCALA';
