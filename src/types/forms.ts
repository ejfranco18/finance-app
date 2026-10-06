export type TransactionType = 'gasto' | 'ingreso' | 'ahorro_inversion';

export type CurrencyCode = 'COP' | 'USD';

export type AccountSource = string;

export type AccountType =
  | 'Banco'
  | 'Billetera Digital'
  | 'Efectivo'
  | 'Ahorro'
  | 'Broker'
  | 'Inversión';

export interface AccountPayload {
  id?: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  initialBalance: number;
}

export type AssetLiabilityType =
  | 'activo_liquido'
  | 'activo_fijo_inversion'
  | 'pasivo_deuda';

export interface TransactionPayload {
  tipo: TransactionType;
  monto: number;
  moneda: CurrencyCode;
  fecha: string;
  cuentaOrigenId: AccountSource;
  categoriaMacroId: string;
  subcategoria: string;
  descripcion: string;
  esRecurrente: boolean;
  metadata?: {
    trmAplicada?: number;
    transactionId?: string;
  };
}

export interface AssetLiabilityPayload {
  tipoClasificacion: AssetLiabilityType;
  nombreInstrumento: string;
  institucion: string;
  moneda: CurrencyCode;
  valorMonto: number;
  tasaRendimientoOInteres?: number;
  fechaValoracion: string;
  esLiquidezInmediata: boolean;
  notasAclaratorias?: string;
}

export interface PeriodConfigPayload {
  periodoMesAno: string;
  trmOficialCopUsd: number;
  tasaAhorroMetaPorcentaje: number;
  limiteGastosPresupuestoCop: number;
  sincronizarConCalcData: boolean;
  observacionesCierre?: string;
}
