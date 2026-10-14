-- Habilitar UUID por si no está activo
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
DECLARE
    -- Reemplaza este valor por tu UID real de Firebase Auth
    v_user_id VARCHAR(128) := '3x2MF8k8fneASdMnlP0iJaast132';

    -- Variables para cuentas
    v_acc_nu UUID;
    v_acc_nu_meridiano UUID;
    v_acc_nequi UUID;
    v_acc_efectivo UUID;
    v_acc_nu_ahorros UUID;
    v_acc_protti UUID;
    v_acc_littio UUID;
    v_acc_dollarapp UUID;
    v_acc_broker UUID;

BEGIN
    -- =========================================================================
    -- 1. USUARIO Y CONFIGURACIÓN BASE
    -- =========================================================================
    INSERT INTO users (id, email, display_name)
    VALUES (v_user_id, 'usuario.finanzas@gmail.com', 'Usuario Principal')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO user_settings (user_id, main_currency, exchange_rate_cop_usd, ai_provider)
    VALUES (v_user_id, 'COP', 3266.77817, 'gemini')
    ON CONFLICT (user_id) DO UPDATE SET exchange_rate_cop_usd = EXCLUDED.exchange_rate_cop_usd;

    -- =========================================================================
    -- 2. CATÁLOGO COMPLETO DE CATEGORÍAS Y SUBCATEGORÍAS (68 subcategorías)
    -- =========================================================================
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Alimentación', 'Restaurante');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Alimentación', 'Domicilios');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Alimentación', 'Cafés / Snacks');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Mercado', 'Mercado');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Apartamentos', 'Cuota apto');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Apartamentos', 'Impuestos / Predial');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Vivienda', 'Administración');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Vivienda', 'Servicios públicos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Vivienda', 'Internet / Telefonía');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Vivienda', 'Mantenimiento / Reparaciones');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Hogar', 'Electrodomesticos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Hogar', 'Muebles / Hogar');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'Combustible');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'Parqueadero');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'Peajes');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'Transporte público');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'Revision carro');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'Uber');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'SOAT / Seguro / Impuestos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Transporte', 'Otros transporte');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Viajes', 'Pasajes');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Viajes', 'Hoteles');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Viajes', 'Comida');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Viajes', 'Museos / Actividades');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Viajes', 'Transporte en viaje');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Viajes', 'Otros viaje');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Suscripciones', 'Streaming');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Suscripciones', 'Apple');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Suscripciones', 'Software / IA');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Suscripciones', 'Otras suscripciones');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Entretenimiento', 'Cine');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Entretenimiento', 'Eventos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Entretenimiento', 'Ocio');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Entretenimiento', 'Conciertos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Entretenimiento', 'Otros entretenimiento');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Juegos', 'Videojuegos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Juegos', 'Juegos de mesa');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Mascotas', 'Comida gatos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Mascotas', 'Arena');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Mascotas', 'Veterinario');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Mascotas', 'Accesorios');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Mascotas', 'Otros mascotas');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Salud', 'Medicamentos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Salud', 'Consultas');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Salud', 'Odontologia');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Salud', 'Otros salud');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Personales', 'Cuidado personal');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Personales', 'Educación');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Personales', 'Gimnasio / Deporte');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Personales', 'Otros personales');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Compras', 'Ropa y accesorios');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Compras', 'Tecnología');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Compras', 'Regalos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Compras', 'Otros compras');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Donaciones', 'Donaciones');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'GASTO', 'Otros', 'Otros gastos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INGRESO_FIJO', 'Ingresos Fijos', 'Salario');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INGRESO_FIJO', 'Ingresos Fijos', 'Arriendo');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INGRESO_VARIABLE', 'Ingresos Variables', 'Otros ingresos variables');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INGRESO_VARIABLE', 'Ingresos Variables', 'Bonos / Comisiones');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INGRESO_VARIABLE', 'Ingresos Variables', 'Reembolsos / Devoluciones');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INGRESO_VARIABLE', 'Ingresos Variables', 'Rendimientos');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'AHORRO', 'Ahorro', 'Ahorro COP');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'AHORRO', 'Ahorro', 'Ahorro USD');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'AHORRO', 'Ahorro', 'Fondo de emergencia');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INVERSION', 'Inversión', 'Acciones / ETFs');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INVERSION', 'Inversión', 'CDT / Renta fija');
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'INVERSION', 'Inversión', 'Inversión inmobiliaria');

    -- =========================================================================
    -- 3. CUENTAS (Con tus saldos exactos)
    -- =========================================================================
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Nu', 'Banco', 'COP', 4701054.61, 4701054.61) RETURNING id INTO v_acc_nu;
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Nu Meridiano', 'Banco', 'COP', 1475537.07, 1475537.07) RETURNING id INTO v_acc_nu_meridiano;
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Nequi', 'Billetera digital', 'COP', 528.95, 528.95) RETURNING id INTO v_acc_nequi;
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Efectivo', 'Efectivo', 'COP', 360000.00, 360000.00) RETURNING id INTO v_acc_efectivo;
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Nu ahorros', 'Ahorro', 'COP', 22154300.59, 22154300.59) RETURNING id INTO v_acc_nu_ahorros;
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Protti', 'Inversión', 'COP', 5000000.00, 5000000.00) RETURNING id INTO v_acc_protti;
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Littio', 'Ahorro', 'USD', 14464.60, 14464.60) RETURNING id INTO v_acc_littio;
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Dollarapp', 'Cuenta en dólares', 'USD', 1252.24, 1252.24) RETURNING id INTO v_acc_dollarapp;

    -- Cuenta Maestro Broker (Agrupa tus acciones en USD)
    INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance) VALUES (uuid_generate_v4(), v_user_id, 'Broker Inversiones', 'Broker', 'USD', 0.00, 0.00) RETURNING id INTO v_acc_broker;

    -- =========================================================================
    -- 4. ACCIONES (SECURITIES) Y PORTAFOLIO DE INVERSIÓN
    -- =========================================================================
    INSERT INTO securities (ticker, name, asset_class, currency, current_price) VALUES ('AAPL', 'Apple Inc.', 'Equity', 'USD', 225.50) ON CONFLICT (ticker) DO UPDATE SET current_price = EXCLUDED.current_price;
    INSERT INTO securities (ticker, name, asset_class, currency, current_price) VALUES ('VOO', 'Vanguard S&P 500 ETF', 'ETF', 'USD', 512.80) ON CONFLICT (ticker) DO UPDATE SET current_price = EXCLUDED.current_price;

    -- Mapeo de saldo en USD a cantidad de acciones exactas (Shares = Saldo USD / Precio Promedio)
    INSERT INTO portfolio_holdings (user_id, account_id, ticker, shares, average_buy_price, currency) VALUES (v_user_id, v_acc_broker, 'AAPL', 3.519467, 225.5000, 'USD') ON CONFLICT DO NOTHING;
    INSERT INTO portfolio_holdings (user_id, account_id, ticker, shares, average_buy_price, currency) VALUES (v_user_id, v_acc_broker, 'VOO', 1.019364, 512.8000, 'USD') ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- 5. ACTIVOS FIJOS REALES
    -- =========================================================================
    INSERT INTO assets (user_id, name, type, estimated_value, currency) VALUES (v_user_id, 'Macerata', 'Inmueble', 400000000.00, 'COP');
    INSERT INTO assets (user_id, name, type, estimated_value, currency) VALUES (v_user_id, 'Meridiano', 'Inmueble', 230000000.00, 'COP');
    INSERT INTO assets (user_id, name, type, estimated_value, currency) VALUES (v_user_id, 'BYD', 'Vehículo', 95000000.00, 'COP');
    INSERT INTO assets (user_id, name, type, estimated_value, currency) VALUES (v_user_id, 'Larimar', 'Inmueble', 47000.00, 'USD');

    -- =========================================================================
    -- 6. PASIVOS REALES (CRÉDITOS HIPOTECARIOS)
    -- =========================================================================
    INSERT INTO liabilities (id, user_id, name, type, original_amount, current_balance, interest_rate, currency) VALUES (uuid_generate_v4(), v_user_id, 'Macerata', 'Crédito hipotecario', 250000000.00, 250000000.00, 0, 'COP');
    INSERT INTO liabilities (id, user_id, name, type, original_amount, current_balance, interest_rate, currency) VALUES (uuid_generate_v4(), v_user_id, 'Meridiano', 'Crédito hipotecario', 107000000.00, 107000000.00, 0, 'COP');

    -- =========================================================================
    -- 7. MOVIMIENTOS HISTÓRICOS (63 registros desde transactions.md)
    -- =========================================================================
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu_meridiano, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'INGRESO_FIJO' AND sub_category_name = 'Arriendo' LIMIT 1), '2026-09-09', 1397440.00, 'COP', 'INGRESO_FIJO', 'Ingresos Fijos', 'Arriendo', 'Arriendo');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Comida gatos' LIMIT 1), '2026-09-13', 135600.00, 'COP', 'GASTO', 'Mascotas', 'Comida gatos', 'Concentrado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Odontologia' LIMIT 1), '2026-09-14', 184000.00, 'COP', 'GASTO', 'Salud', 'Odontologia', 'Cita');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Parqueadero' LIMIT 1), '2026-09-14', 11500.00, 'COP', 'GASTO', 'Transporte', 'Parqueadero', 'Cita parquedadero');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Donaciones' LIMIT 1), '2026-09-15', 60000.00, 'COP', 'GASTO', 'Donaciones', 'Donaciones', 'Donación');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Combustible' LIMIT 1), '2026-09-16', 177678.00, 'COP', 'GASTO', 'Transporte', 'Combustible', 'gasolina');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Revision carro' LIMIT 1), '2026-09-16', 898821.00, 'COP', 'GASTO', 'Transporte', 'Revision carro', 'Mantenimiento de carro');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Uber' LIMIT 1), '2026-09-16', 14025.00, 'COP', 'GASTO', 'Transporte', 'Uber', 'Uber');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Uber' LIMIT 1), '2026-09-16', 20790.00, 'COP', 'GASTO', 'Transporte', 'Uber', 'Uber');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Mercado' LIMIT 1), '2026-09-16', 47490.00, 'COP', 'GASTO', 'Mercado', 'Mercado', 'Mercado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Restaurante' LIMIT 1), '2026-09-16', 25000.00, 'COP', 'GASTO', 'Alimentación', 'Restaurante', 'Almuerzo');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'INGRESO_FIJO' AND sub_category_name = 'Salario' LIMIT 1), '2026-09-18', 17627776.00, 'COP', 'INGRESO_FIJO', 'Ingresos Fijos', 'Salario', 'Salario');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Cuota apto' LIMIT 1), '2026-09-21', 2580000.00, 'COP', 'GASTO', 'Apartamentos', 'Cuota apto', 'Cuota');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'AHORRO' AND sub_category_name = 'Ahorro COP' LIMIT 1), '2026-09-21', 2000000.00, 'COP', 'AHORRO', 'Ahorro', 'Ahorro COP', 'Ahorro COP');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Parqueadero' LIMIT 1), '2026-09-21', 5000.00, 'COP', 'GASTO', 'Transporte', 'Parqueadero', 'Parqueadero');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'INGRESO_VARIABLE' AND sub_category_name = 'Otros ingresos variables' LIMIT 1), '2026-09-18', 567000.00, 'COP', 'INGRESO_VARIABLE', 'Ingresos Variables', 'Otros ingresos variables', 'Regalo');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Streaming' LIMIT 1), '2026-09-18', 30500.00, 'COP', 'GASTO', 'Suscripciones', 'Streaming', 'Spotify');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Parqueadero' LIMIT 1), '2026-09-18', 2650.00, 'COP', 'GASTO', 'Transporte', 'Parqueadero', 'Parqueadero');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Mercado' LIMIT 1), '2026-09-19', 26500.00, 'COP', 'GASTO', 'Mercado', 'Mercado', 'Mercado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Uber' LIMIT 1), '2026-09-19', 12998.00, 'COP', 'GASTO', 'Transporte', 'Uber', 'Uber');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Domicilios' LIMIT 1), '2026-09-19', 62500.00, 'COP', 'GASTO', 'Alimentación', 'Domicilios', 'Restaurante');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Uber' LIMIT 1), '2026-09-19', 10024.11, 'COP', 'GASTO', 'Transporte', 'Uber', 'Uber');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Videojuegos' LIMIT 1), '2026-09-23', 247000.00, 'COP', 'GASTO', 'Juegos', 'Videojuegos', 'Videojuego');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu_meridiano, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Cuota apto' LIMIT 1), '2026-09-23', 1246110.64, 'COP', 'GASTO', 'Apartamentos', 'Cuota apto', 'Cuota');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'INGRESO_VARIABLE' AND sub_category_name = 'Otros ingresos variables' LIMIT 1), '2026-09-22', 30963.31, 'COP', 'INGRESO_VARIABLE', 'Ingresos Variables', 'Otros ingresos variables', 'Devolucion');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Electrodomesticos' LIMIT 1), '2026-09-23', 333333.34, 'COP', 'GASTO', 'Hogar', 'Electrodomesticos', 'TM7');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'AHORRO' AND sub_category_name = 'Ahorro USD' LIMIT 1), '2026-09-24', 2000000.00, 'COP', 'AHORRO', 'Ahorro', 'Ahorro USD', 'Ahorro USD');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Restaurante' LIMIT 1), '2026-09-23', 40900.00, 'COP', 'GASTO', 'Alimentación', 'Restaurante', 'Comida');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Electrodomesticos' LIMIT 1), '2026-09-24', 363903.00, 'COP', 'GASTO', 'Hogar', 'Electrodomesticos', 'Vacuum');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Domicilios' LIMIT 1), '2026-09-25', 36100.00, 'COP', 'GASTO', 'Alimentación', 'Domicilios', 'Comida');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Parqueadero' LIMIT 1), '2026-09-26', 16000.00, 'COP', 'GASTO', 'Transporte', 'Parqueadero', 'Parqueadero');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Donaciones' LIMIT 1), '2026-09-27', 40000.00, 'COP', 'GASTO', 'Donaciones', 'Donaciones', 'Donación');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Restaurante' LIMIT 1), '2026-09-26', 157300.00, 'COP', 'GASTO', 'Alimentación', 'Restaurante', 'Restaurante');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Otros compras' LIMIT 1), '2026-09-26', 231156.00, 'COP', 'GASTO', 'Compras', 'Otros compras', 'Disfraz temu');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Mercado' LIMIT 1), '2026-09-27', 162800.00, 'COP', 'GASTO', 'Mercado', 'Mercado', 'Mercado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Conciertos' LIMIT 1), '2026-09-29', 1004000.00, 'COP', 'GASTO', 'Entretenimiento', 'Conciertos', 'Estereo picnic');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Cafés / Snacks' LIMIT 1), '2026-09-29', 20000.00, 'COP', 'GASTO', 'Alimentación', 'Cafés / Snacks', 'Comida');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nequi, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Donaciones' LIMIT 1), '2026-09-28', 40000.00, 'COP', 'GASTO', 'Donaciones', 'Donaciones', 'Donación');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Arena' LIMIT 1), '2026-09-30', 51800.00, 'COP', 'GASTO', 'Mascotas', 'Arena', 'Arena');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Mercado' LIMIT 1), '2026-09-30', 198547.00, 'COP', 'GASTO', 'Mercado', 'Mercado', 'Mercado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Videojuegos' LIMIT 1), '2026-10-02', 164777.00, 'COP', 'GASTO', 'Juegos', 'Videojuegos', 'Hellraiser');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Apple' LIMIT 1), '2026-10-03', 44900.00, 'COP', 'GASTO', 'Suscripciones', 'Apple', 'Apple');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Restaurante' LIMIT 1), '2026-10-03', 123463.00, 'COP', 'GASTO', 'Alimentación', 'Restaurante', 'Tacos');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Mercado' LIMIT 1), '2026-10-04', 34740.00, 'COP', 'GASTO', 'Mercado', 'Mercado', 'Mercado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Conciertos' LIMIT 1), '2026-10-03', 669500.00, 'COP', 'GASTO', 'Entretenimiento', 'Conciertos', 'Boleta Manson');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Conciertos' LIMIT 1), '2026-10-05', 669500.00, 'COP', 'GASTO', 'Entretenimiento', 'Conciertos', 'Boleta Manson');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Mercado' LIMIT 1), '2026-10-04', 36390.00, 'COP', 'GASTO', 'Mercado', 'Mercado', 'Mercado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Cafés / Snacks' LIMIT 1), '2026-10-05', 7000.00, 'COP', 'GASTO', 'Alimentación', 'Cafés / Snacks', 'Arepa');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Parqueadero' LIMIT 1), '2026-10-04', 8000.00, 'COP', 'GASTO', 'Transporte', 'Parqueadero', 'Parqueadero');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Parqueadero' LIMIT 1), '2026-10-03', 2000.00, 'COP', 'GASTO', 'Transporte', 'Parqueadero', 'Parqueadero');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_efectivo, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Donaciones' LIMIT 1), '2026-10-07', 50000.00, 'COP', 'GASTO', 'Donaciones', 'Donaciones', 'Donación');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu_meridiano, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Administración' LIMIT 1), '2026-10-06', 130300.00, 'COP', 'GASTO', 'Vivienda', 'Administración', 'Administracion Meridiano');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Internet / Telefonía' LIMIT 1), '2026-10-08', 69900.00, 'COP', 'GASTO', 'Vivienda', 'Internet / Telefonía', 'Celular');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Internet / Telefonía' LIMIT 1), '2026-10-08', 110990.00, 'COP', 'GASTO', 'Vivienda', 'Internet / Telefonía', 'Movistar');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Streaming' LIMIT 1), '2026-10-08', 23500.00, 'COP', 'GASTO', 'Suscripciones', 'Streaming', 'Paramount');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Comida gatos' LIMIT 1), '2026-10-07', 142400.00, 'COP', 'GASTO', 'Mascotas', 'Comida gatos', 'Concentrado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Medicamentos' LIMIT 1), '2026-10-07', 412060.00, 'COP', 'GASTO', 'Salud', 'Medicamentos', 'Medicina');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'SOAT / Seguro / Impuestos' LIMIT 1), '2026-10-07', 123188.00, 'COP', 'GASTO', 'Transporte', 'SOAT / Seguro / Impuestos', 'Seguro auto');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Juegos de mesa' LIMIT 1), '2026-10-07', 256934.00, 'COP', 'GASTO', 'Juegos', 'Juegos de mesa', 'Zombicede marvel');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Administración' LIMIT 1), '2026-10-06', 488689.00, 'COP', 'GASTO', 'Vivienda', 'Administración', 'Administracion Macerata');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Domicilios' LIMIT 1), '2026-10-06', 34000.00, 'COP', 'GASTO', 'Alimentación', 'Domicilios', 'Almuerzo');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'GASTO' AND sub_category_name = 'Mercado' LIMIT 1), '2026-10-05', 36390.00, 'COP', 'GASTO', 'Mercado', 'Mercado', 'Mercado');
    INSERT INTO transactions (user_id, account_id, category_id, date, amount, currency, category_type, category_name, sub_category_name, description) VALUES (v_user_id, v_acc_nu_meridiano, (SELECT id FROM categories WHERE user_id = v_user_id AND type = 'INGRESO_FIJO' AND sub_category_name = 'Arriendo' LIMIT 1), '2026-10-10', 1397440.00, 'COP', 'INGRESO_FIJO', 'Ingresos Fijos', 'Arriendo', 'Arriendo');

    -- =========================================================================
    -- 8. CATEGORÍAS DE TRANSFERENCIA / PAGO DE TARJETA DE CRÉDITO
    -- =========================================================================
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'TRANSFERENCIA', 'Transferencia', 'Pago Tarjeta de Crédito') ON CONFLICT DO NOTHING;
    INSERT INTO categories (id, user_id, type, category_name, sub_category_name) VALUES (uuid_generate_v4(), v_user_id, 'TRANSFERENCIA', 'Transferencia', 'Traspaso entre Cuentas') ON CONFLICT DO NOTHING;

END $$;

-- =========================================================================
-- VISTA ACTUALIZADA: v_net_worth (Saldos negativos de TC suman a Pasivos)
-- =========================================================================
CREATE OR REPLACE VIEW v_net_worth AS
WITH user_trm AS (
  SELECT u.id AS user_id, COALESCE(s.exchange_rate_cop_usd, 4000.00) AS trm
  FROM users u
  LEFT JOIN user_settings s ON u.id = s.user_id
),
accounts_cop AS (
  SELECT
    a.user_id,
    SUM(
      CASE
        WHEN a.current_balance > 0 THEN
          CASE WHEN a.currency = 'USD' THEN a.current_balance * ut.trm ELSE a.current_balance END
        ELSE 0
      END
    ) AS total_liquid_accounts,
    SUM(
      CASE
        WHEN a.current_balance < 0 THEN
          ABS(CASE WHEN a.currency = 'USD' THEN a.current_balance * ut.trm ELSE a.current_balance END)
        ELSE 0
      END
    ) AS total_cc_debt
  FROM accounts a
  JOIN user_trm ut ON a.user_id = ut.user_id
  WHERE a.is_active = true
  GROUP BY a.user_id
),
portfolio_cop AS (
  SELECT
    vp.user_id,
    SUM(CASE WHEN vp.currency = 'USD' THEN vp.current_market_value * ut.trm ELSE vp.current_market_value END) AS total_portfolio
  FROM v_investment_portfolio vp
  JOIN user_trm ut ON vp.user_id = ut.user_id
  GROUP BY vp.user_id
),
fixed_assets_cop AS (
  SELECT
    fa.user_id,
    SUM(CASE WHEN fa.currency = 'USD' THEN fa.current_value * ut.trm ELSE fa.current_value END) AS total_fixed_assets
  FROM fixed_assets fa
  JOIN user_trm ut ON fa.user_id = ut.user_id
  WHERE fa.is_active = true
  GROUP BY fa.user_id
),
liabilities_cop AS (
  SELECT
    l.user_id,
    SUM(CASE WHEN l.currency = 'USD' THEN l.current_balance * ut.trm ELSE l.current_balance END) AS total_liabilities
  FROM liabilities l
  JOIN user_trm ut ON l.user_id = ut.user_id
  WHERE l.is_active = true
  GROUP BY l.user_id
)
SELECT
  ut.user_id,
  ROUND(COALESCE(ac.total_liquid_accounts, 0) + COALESCE(pc.total_portfolio, 0), 2) AS liquid_assets,
  ROUND(COALESCE(fac.total_fixed_assets, 0), 2) AS fixed_assets,
  ROUND(COALESCE(ac.total_liquid_accounts, 0) + COALESCE(pc.total_portfolio, 0) + COALESCE(fac.total_fixed_assets, 0), 2) AS total_assets,
  ROUND(COALESCE(lc.total_liabilities, 0) + COALESCE(ac.total_cc_debt, 0), 2) AS total_liabilities,
  ROUND(
    COALESCE(ac.total_liquid_accounts, 0) + COALESCE(pc.total_portfolio, 0) + COALESCE(fac.total_fixed_assets, 0)
    - (COALESCE(lc.total_liabilities, 0) + COALESCE(ac.total_cc_debt, 0)),
    2
  ) AS net_worth
FROM user_trm ut
LEFT JOIN accounts_cop ac ON ut.user_id = ac.user_id
LEFT JOIN portfolio_cop pc ON ut.user_id = pc.user_id
LEFT JOIN fixed_assets_cop fac ON ut.user_id = fac.user_id
LEFT JOIN liabilities_cop lc ON ut.user_id = lc.user_id;

