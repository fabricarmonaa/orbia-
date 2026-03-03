CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"features_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_monthly" numeric(12, 2),
	"currency" varchar(10) DEFAULT 'ARS',
	"max_branches" integer DEFAULT 1,
	"allow_cashiers" boolean DEFAULT false NOT NULL,
	"allow_margin_pricing" boolean DEFAULT false NOT NULL,
	"allow_excel_import" boolean DEFAULT false NOT NULL,
	"allow_custom_tos" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_plan_code_unique" UNIQUE("plan_code")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"tos_content" text,
	"tos_updated_at" timestamp,
	"plan_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"subscription_start_date" timestamp,
	"subscription_end_date" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_unique" UNIQUE("code"),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"email" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"role" varchar(50) DEFAULT 'staff' NOT NULL,
	"scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
	"branch_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"avatar_updated_at" timestamp,
	"token_invalid_before" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "super_admin_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"avatar_url" text,
	"brand_name" varchar(200) DEFAULT 'ORBIA',
	"config_json" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "super_admin_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"business_name" varchar(200),
	"business_type" varchar(100),
	"business_description" text,
	"logo_url" text,
	"currency" varchar(10) DEFAULT 'ARS',
	"tracking_expiration_hours" integer DEFAULT 24,
	"language" varchar(10) DEFAULT 'es',
	"tracking_layout" varchar(50) DEFAULT 'classic',
	"tracking_primary_color" varchar(20) DEFAULT '#6366f1',
	"tracking_accent_color" varchar(20) DEFAULT '#8b5cf6',
	"tracking_bg_color" varchar(20) DEFAULT '#ffffff',
	"tracking_tos_text" text,
	"config_json" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "tenant_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" text,
	"phone" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "order_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer,
	"content" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"status_id" integer,
	"changed_by_id" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6B7280',
	"sort_order" integer DEFAULT 0,
	"is_final" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"branch_id" integer,
	"order_number" integer NOT NULL,
	"type" varchar(50) DEFAULT 'PEDIDO' NOT NULL,
	"customer_name" varchar(200),
	"customer_phone" varchar(50),
	"customer_email" varchar(255),
	"description" text,
	"status_id" integer,
	"total_amount" numeric(12, 2),
	"scheduled_at" timestamp,
	"closed_at" timestamp,
	"public_tracking_id" varchar(100),
	"tracking_expires_at" timestamp,
	"tracking_revoked" boolean DEFAULT false,
	"sale_id" integer,
	"sale_public_token" varchar(120),
	"requires_delivery" boolean DEFAULT false NOT NULL,
	"delivery_address" text,
	"delivery_city" varchar(200),
	"delivery_address_notes" text,
	"delivery_receiver_name" varchar(200),
	"delivery_receiver_phone" varchar(50),
	"delivery_schedule" varchar(100),
	"delivery_lat" numeric(10, 7),
	"delivery_lng" numeric(10, 7),
	"delivery_status" varchar(50),
	"assigned_agent_id" integer,
	"created_by_id" integer,
	"created_by_scope" varchar(20) DEFAULT 'TENANT',
	"created_by_branch_id" integer,
	"order_preset_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_public_tracking_id_unique" UNIQUE("public_tracking_id")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"session_id" integer,
	"branch_id" integer,
	"type" varchar(20) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" varchar(50) DEFAULT 'efectivo',
	"category" varchar(100),
	"description" text,
	"expense_definition_id" integer,
	"expense_definition_name" varchar(200),
	"order_id" integer,
	"sale_id" integer,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"branch_id" integer,
	"user_id" integer NOT NULL,
	"opening_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"closing_amount" numeric(12, 2),
	"difference" numeric(12, 2),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) DEFAULT 'variable' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(100),
	"default_amount" numeric(12, 2),
	"currency" varchar(10),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"category_id" integer,
	"name" varchar(200) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"periodicity" varchar(20) DEFAULT 'monthly',
	"pay_day" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_monthly_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"totals_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"category_id" integer,
	"name" varchar(200) NOT NULL,
	"description" text,
	"price" numeric(12, 2) NOT NULL,
	"cost" numeric(12, 2),
	"pricing_mode" varchar(20) DEFAULT 'MANUAL' NOT NULL,
	"cost_amount" numeric(12, 2),
	"cost_currency" varchar(10),
	"margin_pct" numeric(5, 2),
	"stock" integer,
	"min_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"sku" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"status_code" varchar(40) DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_action_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"requires_photo" boolean DEFAULT true NOT NULL,
	"requires_comment" boolean DEFAULT false NOT NULL,
	"next_order_status_id" integer,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "delivery_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"dni" varchar(20) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"pin_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"route_id" integer,
	"stop_id" integer,
	"order_id" integer NOT NULL,
	"action_code" varchar(50) NOT NULL,
	"photo_url" text,
	"notes" text,
	"delivered_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_route_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"stop_order" integer NOT NULL,
	"action_state_id" integer,
	"action_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "delivery_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"agent_id" integer NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"origin_address" text,
	"directions_url" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tenant_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"addon_key" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_by_id" integer,
	"enabled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_stock_by_branch" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"branch_id" integer,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"average_cost" numeric(14, 4) DEFAULT '0',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"branch_id" integer,
	"movement_type" varchar(30) DEFAULT 'ADJUSTMENT_IN' NOT NULL,
	"reference_id" integer,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 4),
	"total_cost" numeric(14, 2),
	"note" varchar(250),
	"reason" varchar(200),
	"created_by_user_id" integer,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"from_branch_id" integer,
	"to_branch_id" integer,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stt_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"transcript" text NOT NULL,
	"intent_confirmed" varchar(80) NOT NULL,
	"entities_confirmed" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"error_code" varchar(80),
	"idempotency_key" varchar(120) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stt_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"context" varchar(50) NOT NULL,
	"transcription" text,
	"intent_json" jsonb,
	"confirmed" boolean DEFAULT false,
	"result_entity_type" varchar(50),
	"result_entity_id" integer,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" integer,
	"changes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50),
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by_id" integer,
	CONSTRAINT "user_permissions_user_id_permission_id_unique" UNIQUE("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "app_branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"orbia_logo_url" text,
	"orbia_name" varchar(120) DEFAULT 'Orbia',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"logo_url" text,
	"display_name" varchar(60),
	"colors_json" jsonb DEFAULT '{}'::jsonb,
	"texts_json" jsonb DEFAULT '{}'::jsonb,
	"links_json" jsonb DEFAULT '{}'::jsonb,
	"pdf_config_json" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_branding_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_pdf_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"document_type" varchar(20) DEFAULT 'PRICE_LIST' NOT NULL,
	"template_key" varchar(20) DEFAULT 'CLASSIC' NOT NULL,
	"page_size" varchar(10) DEFAULT 'A4' NOT NULL,
	"orientation" varchar(12) DEFAULT 'portrait' NOT NULL,
	"show_logo" boolean DEFAULT true NOT NULL,
	"header_text" varchar(80),
	"subheader_text" varchar(120),
	"footer_text" varchar(160),
	"show_branch_stock" boolean DEFAULT true NOT NULL,
	"show_sku" boolean DEFAULT false NOT NULL,
	"show_description" boolean DEFAULT true NOT NULL,
	"price_column_label" varchar(30) DEFAULT 'Precio' NOT NULL,
	"currency_symbol" varchar(5) DEFAULT '$' NOT NULL,
	"columns_json" jsonb DEFAULT '[]'::jsonb,
	"invoice_columns_json" jsonb DEFAULT '[]'::jsonb,
	"document_title" varchar(80),
	"fiscal_name" varchar(120),
	"fiscal_cuit" varchar(30),
	"fiscal_iibb" varchar(30),
	"fiscal_address" varchar(160),
	"fiscal_city" varchar(120),
	"show_footer_totals" boolean DEFAULT true NOT NULL,
	"styles_json" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_pdf_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"idempotency_key" varchar(120) NOT NULL,
	"route" varchar(120) NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_daily_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"day" date NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"revenue_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"orders_cancelled_count" integer DEFAULT 0 NOT NULL,
	"cash_in_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cash_out_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_monthly_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"month" date NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"revenue_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"orders_cancelled_count" integer DEFAULT 0 NOT NULL,
	"cash_in_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cash_out_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"super_admin_id" integer,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admin_totp" (
	"id" serial PRIMARY KEY NOT NULL,
	"super_admin_id" integer NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"subject" varchar(200) NOT NULL,
	"html" text NOT NULL,
	"text" text,
	"send_to_all" boolean DEFAULT false NOT NULL,
	"requested_tenant_ids_json" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_delivery_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"to_email" varchar(255) NOT NULL,
	"status" varchar(10) NOT NULL,
	"error_message" varchar(500),
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"key" varchar(60),
	"name" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"channel" varchar(40) DEFAULT 'whatsapp_link' NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"branch_id" integer,
	"product_id" integer NOT NULL,
	"product_name_snapshot" varchar(200) NOT NULL,
	"sku_snapshot" varchar(100),
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"branch_id" integer,
	"cashier_user_id" integer,
	"sale_number" varchar(30) NOT NULL,
	"sale_datetime" timestamp DEFAULT now() NOT NULL,
	"currency" varchar(10) DEFAULT 'ARS' NOT NULL,
	"subtotal_amount" numeric(12, 2) NOT NULL,
	"discount_type" varchar(20) DEFAULT 'NONE' NOT NULL,
	"discount_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"surcharge_type" varchar(20) DEFAULT 'NONE' NOT NULL,
	"surcharge_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"surcharge_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(30) NOT NULL,
	"notes" text,
	"customer_id" integer,
	"public_token" varchar(120),
	"public_token_created_at" timestamp,
	"public_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"key" varchar(50) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"branch_id" integer,
	"name" varchar(120) NOT NULL,
	"pin_hash" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"base_currency" varchar(10) NOT NULL,
	"target_currency" varchar(10) NOT NULL,
	"rate" numeric(18, 6) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"doc" varchar(50),
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"entity" varchar(30) NOT NULL,
	"file_name" varchar(255),
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"success_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"branch_id" integer,
	"product_id" integer,
	"product_code_snapshot" varchar(120),
	"product_name_snapshot" varchar(200) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'ARS' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"branch_id" integer,
	"provider_id" integer,
	"provider_name" varchar(200),
	"purchase_date" timestamp DEFAULT now() NOT NULL,
	"currency" varchar(10) DEFAULT 'ARS' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"imported_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tenant_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_code" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"code" varchar(40) NOT NULL,
	"label" varchar(60) NOT NULL,
	"color" varchar(20),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"field_definition_id" integer,
	"original_name" varchar(260) NOT NULL,
	"stored_name" varchar(400) NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_field_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_type_id" integer NOT NULL,
	"preset_id" integer,
	"field_key" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"field_type" varchar(20) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"visible_in_tracking" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"field_definition_id" integer NOT NULL,
	"value_text" text,
	"value_number" numeric(14, 4),
	"file_storage_key" text,
	"visible_override" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_type_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"label" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_type_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_type_id" integer NOT NULL,
	"code" varchar(80) NOT NULL,
	"label" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_config" ADD CONSTRAINT "super_admin_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_config" ADD CONSTRAINT "tenant_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_status_id_order_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."order_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_statuses" ADD CONSTRAINT "order_statuses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_id_order_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."order_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_branch_id_branches_id_fk" FOREIGN KEY ("created_by_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_expense_definition_id_expense_definitions_id_fk" FOREIGN KEY ("expense_definition_id") REFERENCES "public"."expense_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_definitions" ADD CONSTRAINT "expense_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_expenses" ADD CONSTRAINT "fixed_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_expenses" ADD CONSTRAINT "fixed_expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_monthly_summaries" ADD CONSTRAINT "tenant_monthly_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_action_states" ADD CONSTRAINT "delivery_action_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_action_states" ADD CONSTRAINT "delivery_action_states_next_order_status_id_order_statuses_id_fk" FOREIGN KEY ("next_order_status_id") REFERENCES "public"."order_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agents" ADD CONSTRAINT "delivery_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_route_id_delivery_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."delivery_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_stop_id_delivery_route_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."delivery_route_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_delivered_by_id_delivery_agents_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."delivery_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_route_stops" ADD CONSTRAINT "delivery_route_stops_route_id_delivery_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."delivery_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_route_stops" ADD CONSTRAINT "delivery_route_stops_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_route_stops" ADD CONSTRAINT "delivery_route_stops_action_state_id_delivery_action_states_id_fk" FOREIGN KEY ("action_state_id") REFERENCES "public"."delivery_action_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_agent_id_delivery_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."delivery_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_enabled_by_id_users_id_fk" FOREIGN KEY ("enabled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock_by_branch" ADD CONSTRAINT "product_stock_by_branch_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock_by_branch" ADD CONSTRAINT "product_stock_by_branch_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock_by_branch" ADD CONSTRAINT "product_stock_by_branch_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stt_interactions" ADD CONSTRAINT "stt_interactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stt_interactions" ADD CONSTRAINT "stt_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stt_logs" ADD CONSTRAINT "stt_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stt_logs" ADD CONSTRAINT "stt_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_pdf_settings" ADD CONSTRAINT "tenant_pdf_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_daily_metrics" ADD CONSTRAINT "tenant_daily_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_monthly_metrics" ADD CONSTRAINT "tenant_monthly_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_super_admin_id_users_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_totp" ADD CONSTRAINT "super_admin_totp_super_admin_id_users_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashiers" ADD CONSTRAINT "cashiers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashiers" ADD CONSTRAINT "cashiers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_definitions" ADD CONSTRAINT "status_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_field_definition_id_order_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."order_field_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_definitions" ADD CONSTRAINT "order_field_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_definitions" ADD CONSTRAINT "order_field_definitions_order_type_id_order_type_definitions_id_fk" FOREIGN KEY ("order_type_id") REFERENCES "public"."order_type_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_definitions" ADD CONSTRAINT "order_field_definitions_preset_id_order_type_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."order_type_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_values" ADD CONSTRAINT "order_field_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_values" ADD CONSTRAINT "order_field_values_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_values" ADD CONSTRAINT "order_field_values_field_definition_id_order_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."order_field_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_type_definitions" ADD CONSTRAINT "order_type_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_type_presets" ADD CONSTRAINT "order_type_presets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_type_presets" ADD CONSTRAINT "order_type_presets_order_type_id_order_type_definitions_id_fk" FOREIGN KEY ("order_type_id") REFERENCES "public"."order_type_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_users_tenant_deleted_at" ON "users" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE INDEX "single_super_admin_idx" ON "users" USING btree ("is_super_admin") WHERE is_super_admin = true AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_branches_tenant" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_branches_tenant_deleted_at" ON "branches" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_order_comments_order" ON "order_comments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_history_order" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_history_tenant_created" ON "order_status_history" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_order_statuses_tenant" ON "order_statuses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_tenant" ON "orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_tenant_created" ON "orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_orders_tenant_status_created" ON "orders" USING btree ("tenant_id","status_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_orders_tenant_tracking" ON "orders" USING btree ("tenant_id","public_tracking_id");--> statement-breakpoint
CREATE INDEX "idx_orders_tracking" ON "orders" USING btree ("public_tracking_id");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_tenant" ON "cash_movements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_tenant_created_session" ON "cash_movements" USING btree ("tenant_id","created_at","session_id");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_tenant_created_branch" ON "cash_movements" USING btree ("tenant_id","created_at","branch_id");--> statement-breakpoint
CREATE INDEX "idx_cash_sessions_tenant" ON "cash_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_cash_sessions_tenant_created_session" ON "cash_sessions" USING btree ("tenant_id","opened_at","id");--> statement-breakpoint
CREATE INDEX "idx_expense_cats_tenant" ON "expense_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_expense_defs_tenant" ON "expense_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_expense_defs_tenant_type" ON "expense_definitions" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "idx_fixed_expenses_tenant" ON "fixed_expenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_monthly_summaries_tenant" ON "tenant_monthly_summaries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_monthly_summaries_period" ON "tenant_monthly_summaries" USING btree ("tenant_id","year","month");--> statement-breakpoint
CREATE INDEX "idx_prod_cats_tenant" ON "product_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_products_tenant" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_products_tenant_active" ON "products" USING btree ("tenant_id","is_active","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_tenant_category_active_created" ON "products" USING btree ("tenant_id","category_id","is_active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_products_tenant_sku" ON "products" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "idx_delivery_action_states_tenant" ON "delivery_action_states" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_agents_tenant" ON "delivery_agents" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_agents_dni" ON "delivery_agents" USING btree ("tenant_id","dni");--> statement-breakpoint
CREATE INDEX "idx_delivery_proofs_order" ON "delivery_proofs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_route_stops_route" ON "delivery_route_stops" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_routes_tenant" ON "delivery_routes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_addons_tenant" ON "tenant_addons" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_addons_key" ON "tenant_addons" USING btree ("tenant_id","addon_key");--> statement-breakpoint
CREATE INDEX "idx_stock_branch_tenant" ON "product_stock_by_branch" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_stock_branch_product" ON "product_stock_by_branch" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stock_branch_product" ON "product_stock_by_branch" USING btree ("tenant_id","product_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stock_levels_tenant_product_branch" ON "stock_levels" USING btree ("tenant_id","product_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_levels_tenant_branch" ON "stock_levels" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_tenant" ON "stock_movements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_tenant_created" ON "stock_movements" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_kardex" ON "stock_movements" USING btree ("tenant_id","product_id","branch_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_stt_interactions_tenant" ON "stt_interactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_stt_interactions_tenant_user" ON "stt_interactions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stt_interactions_tenant_user_idempotency" ON "stt_interactions" USING btree ("tenant_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_stt_logs_tenant" ON "stt_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_permissions_tenant_user_idx" ON "user_permissions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_branding_tenant" ON "tenant_branding" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pdf_settings_tenant" ON "tenant_pdf_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_idempotency_tenant_user_key_route" ON "idempotency_keys" USING btree ("tenant_id","user_id","idempotency_key","route");--> statement-breakpoint
CREATE INDEX "idx_idempotency_tenant_created" ON "idempotency_keys" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_daily_metrics_day" ON "tenant_daily_metrics" USING btree ("tenant_id","day");--> statement-breakpoint
CREATE INDEX "idx_tenant_daily_metrics_tenant_day" ON "tenant_daily_metrics" USING btree ("tenant_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_monthly_metrics_month" ON "tenant_monthly_metrics" USING btree ("tenant_id","month");--> statement-breakpoint
CREATE INDEX "idx_tenant_monthly_metrics_tenant_month" ON "tenant_monthly_metrics" USING btree ("tenant_id","month");--> statement-breakpoint
CREATE INDEX "idx_super_admin_audit_admin" ON "super_admin_audit_logs" USING btree ("super_admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_super_admin_totp_admin" ON "super_admin_totp" USING btree ("super_admin_id");--> statement-breakpoint
CREATE INDEX "idx_super_admin_totp_admin" ON "super_admin_totp" USING btree ("super_admin_id");--> statement-breakpoint
CREATE INDEX "idx_email_campaigns_created_by" ON "email_campaigns" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_email_delivery_campaign" ON "email_delivery_logs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_email_delivery_tenant" ON "email_delivery_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_message_templates_tenant" ON "message_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_message_templates_active" ON "message_templates" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_sale_items_sale" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "idx_sale_items_sale_product" ON "sale_items" USING btree ("sale_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_sale_items_tenant_product" ON "sale_items" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant" ON "sales" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_created" ON "sales" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_date" ON "sales" USING btree ("tenant_id","sale_datetime");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_branch_date" ON "sales" USING btree ("tenant_id","branch_id","sale_datetime");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sales_tenant_number" ON "sales" USING btree ("tenant_id","sale_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_counters_key" ON "tenant_counters" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "idx_cashiers_tenant" ON "cashiers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cashiers_tenant_branch_name" ON "cashiers" USING btree ("tenant_id","branch_id","name");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_tenant" ON "exchange_rates" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exchange_rates_pair" ON "exchange_rates" USING btree ("tenant_id","base_currency","target_currency");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant_created" ON "customers" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant_doc" ON "customers" USING btree ("tenant_id","doc");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant_email" ON "customers" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customers_tenant_doc" ON "customers" USING btree ("tenant_id","doc");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customers_tenant_email" ON "customers" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_tenant" ON "import_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_items_purchase" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "idx_purchases_tenant" ON "purchases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_subscriptions_tenant" ON "tenant_subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_status_definitions_tenant_entity" ON "status_definitions" USING btree ("tenant_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_status_definitions_tenant_entity_code" ON "status_definitions" USING btree ("tenant_id","entity_type","code");--> statement-breakpoint
CREATE INDEX "idx_order_attachments_order" ON "order_attachments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_attachments_tenant" ON "order_attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_order_field_definitions_preset" ON "order_field_definitions" USING btree ("preset_id");--> statement-breakpoint
CREATE INDEX "idx_order_field_definitions_tenant_type" ON "order_field_definitions" USING btree ("tenant_id","order_type_id");--> statement-breakpoint
CREATE INDEX "idx_order_field_values_tenant_order" ON "order_field_values" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_field_values_order_field" ON "order_field_values" USING btree ("order_id","field_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_type_definitions_tenant_code" ON "order_type_definitions" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_order_type_definitions_tenant" ON "order_type_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_type_presets_tenant_type_code" ON "order_type_presets" USING btree ("tenant_id","order_type_id","code");--> statement-breakpoint
CREATE INDEX "idx_order_type_presets_tenant_type" ON "order_type_presets" USING btree ("tenant_id","order_type_id");