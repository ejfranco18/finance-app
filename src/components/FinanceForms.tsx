import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../lib/firebaseClient';
import {
  TransactionPayload,
  AssetLiabilityPayload,
  PeriodConfigPayload,
  AccountPayload,
  AccountType,
  TransactionType,
  CurrencyCode,
  AccountSource,
  AssetLiabilityType,
} from '../types/forms';
import {
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  DollarSign,
  Building,
  Sparkles,
  ArrowRight,
  Code2,
  Wallet,
} from 'lucide-react';
import styles from './FinanceForms.module.css';

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (auth.currentUser?.uid) {
    headers['x-user-id'] = auth.currentUser.uid;
  }
  return headers;
}

const MACRO_CATEGORY_LABELS: Record<string, string> = {
  apartamentos: 'Apartamentos',
  transporte: 'Transporte',
  hogar: 'Hogar',
  alimentacion: 'Alimentación',
  entretenimiento: 'Entretenimiento',
  juegos: 'Juegos',
  mercado: 'Mercado',
  compras: 'Compras',
  salud: 'Salud',
  mascotas: 'Mascotas',
  donaciones: 'Donaciones',
  trabajo: 'Trabajo',
  otros: 'Otros / Varios',
};

/* =========================================================================
   FORMULARIO 1: REGISTRO DE NUEVA TRANSACCIÓN / FLUJO DE CAJA
   ========================================================================= */

export interface AccountOption {
  id: string;
  name: string;
  type: string;
  currency: string;
}

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  accounts?: AccountOption[];
  trm?: number;
  onSubmitSuccess?: (payload: TransactionPayload) => void;
}

export const TransactionFormModal: React.FC<TransactionFormProps> = ({
  isOpen,
  onClose,
  accounts = [],
  trm = 3303.16,
  onSubmitSuccess,
}) => {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TransactionType>('gasto');
  const [monto, setMonto] = useState<string>('');
  const [moneda, setMoneda] = useState<CurrencyCode>('COP');
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [cuentaOrigenId, setCuentaOrigenId] = useState<AccountSource>(
    accounts[0]?.id || 'Cuenta Nu COP'
  );
  const [categoriaMacroId, setCategoriaMacroId] = useState<string>('alimentacion');
  const [subcategoria, setSubcategoria] = useState<string>('Mercado');
  const [descripcion, setDescripcion] = useState<string>('');
  const [esRecurrente, setEsRecurrente] = useState<boolean>(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successPayload, setSuccessPayload] = useState<TransactionPayload | null>(null);

  useEffect(() => {
    if (accounts.length > 0 && (!cuentaOrigenId || cuentaOrigenId === 'Cuenta Nu COP')) {
      setCuentaOrigenId(accounts[0].id);
    }
  }, [accounts, cuentaOrigenId]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    const numericAmount = parseFloat(monto);
    if (!monto || isNaN(numericAmount) || numericAmount <= 0) {
      newErrors.monto = 'El monto debe ser un número positivo mayor a 0.';
    }

    if (!fecha) {
      newErrors.fecha = 'La fecha de la transacción es obligatoria.';
    }

    if (!subcategoria.trim() || subcategoria.trim().length < 2) {
      newErrors.subcategoria = 'La subcategoría debe contener al menos 2 caracteres.';
    }

    if (descripcion.trim().length > 180) {
      newErrors.descripcion = 'La descripción no puede superar los 180 caracteres.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setSuccessPayload(null);
    setErrors({});

    const categoryTypeMap: Record<TransactionType, string> = {
      gasto: 'GASTO',
      ingreso: esRecurrente ? 'INGRESO_FIJO' : 'INGRESO_VARIABLE',
      ahorro_inversion: 'AHORRO',
    };

    const categoryName = MACRO_CATEGORY_LABELS[categoriaMacroId] || categoriaMacroId;
    const numericAmount = parseFloat(monto);

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accountId: cuentaOrigenId,
          date: fecha,
          amount: numericAmount,
          currency: moneda,
          categoryType: categoryTypeMap[tipo],
          categoryName,
          subCategoryName: subcategoria.trim(),
          description: descripcion.trim() || null,
          isRecurring: esRecurrente,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo guardar la transacción en Neon DB.');
      }

      const payload: TransactionPayload = {
        tipo,
        monto: numericAmount,
        moneda,
        fecha,
        cuentaOrigenId,
        categoriaMacroId: categoryName,
        subcategoria: subcategoria.trim(),
        descripcion: descripcion.trim(),
        esRecurrente,
        metadata: {
          trmAplicada: moneda === 'USD' ? trm : undefined,
          transactionId: result.transactionId,
        },
      };

      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
      setSuccessPayload(payload);
      if (onSubmitSuccess) onSubmitSuccess(payload);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Error al registrar la transacción.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-form-title"
        className={styles.modalCard}
      >
        {/* Glow Superior */}
        <div className={styles.topGlowEmerald} />

        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBoxEmerald}>
              <DollarSign className={styles.headerIcon} />
            </div>
            <div>
              <h2 id="tx-form-title" className={styles.modalTitle}>
                Registrar Movimiento en Flujo de Caja
              </h2>
              <p className={styles.modalSubtitle}>Sincronización directa con Neon PostgreSQL</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar modal" className={styles.closeBtn}>
            <X className={styles.closeIcon} />
          </button>
        </div>

        {successPayload ? (
          <div className={styles.successBlock}>
            <div className={styles.successBannerEmerald}>
              <CheckCircle2 className={styles.successIconEmerald} />
              <div>
                <h4 className={styles.successTitleEmerald}>
                  ¡Transacción Registrada Exitosamente!
                </h4>
                <p className={styles.successDesc}>
                  El movimiento ha sido consolidado en Neon DB y el saldo de la cuenta se actualizó.
                </p>
              </div>
            </div>

            <div className={styles.payloadBox}>
              <div className={styles.payloadHeader}>
                <span className={styles.payloadLabelCyan}>
                  <Code2 className={styles.smallIcon} /> Payload Guardado en DB
                </span>
                <span className={styles.statusEmerald}>Status: 201 Created</span>
              </div>
              <pre className={styles.payloadPre}>{JSON.stringify(successPayload, null, 2)}</pre>
            </div>

            <div className={styles.successActions}>
              <button
                type="button"
                onClick={() => {
                  setSuccessPayload(null);
                  setMonto('');
                  setDescripcion('');
                }}
                className={styles.secondaryActionBtn}
              >
                Registrar Otro
              </button>
              <button type="button" onClick={onClose} className={styles.doneBtnEmerald}>
                Listo / Volver al Canvas
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            {/* Tipo de Transacción (Segmented Control) */}
            <div>
              <label className={styles.labelSpaced}>Tipo de Transacción</label>
              <div className={styles.segmentedGrid}>
                <button
                  type="button"
                  onClick={() => setTipo('gasto')}
                  className={`${styles.segBtn} ${
                    tipo === 'gasto' ? styles.segBtnActiveRose : ''
                  }`}
                >
                  Gasto / Egreso
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('ingreso')}
                  className={`${styles.segBtn} ${
                    tipo === 'ingreso' ? styles.segBtnActiveEmerald : ''
                  }`}
                >
                  Ingreso Operativo
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('ahorro_inversion')}
                  className={`${styles.segBtn} ${
                    tipo === 'ahorro_inversion' ? styles.segBtnActiveCyan : ''
                  }`}
                >
                  Ahorro / Inversión
                </button>
              </div>
            </div>

            {/* Monto y Moneda */}
            <div className={styles.gridAmountRow}>
              <div className={styles.colSpan2}>
                <label htmlFor="tx-monto" className={styles.label}>
                  Monto <span className={styles.requiredStar}>*</span>
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="tx-monto"
                    name="monto"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="ej. 350000"
                    value={monto}
                    onChange={(e) => {
                      setMonto(e.target.value);
                      if (errors.monto) setErrors((prev) => ({ ...prev, monto: '' }));
                    }}
                    aria-invalid={!!errors.monto}
                    aria-describedby={errors.monto ? 'tx-monto-err' : undefined}
                    className={styles.inputMono}
                  />
                </div>
                {errors.monto && (
                  <p id="tx-monto-err" className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.monto}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="tx-moneda" className={styles.label}>
                  Moneda
                </label>
                <select
                  id="tx-moneda"
                  name="moneda"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value as CurrencyCode)}
                  className={styles.inputMono}
                >
                  <option value="COP">COP ($)</option>
                  <option value="USD">USD (US$)</option>
                </select>
              </div>
            </div>

            {/* Fecha y Cuenta Origen */}
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="tx-fecha" className={styles.label}>
                  Fecha <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="tx-fecha"
                  name="fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={styles.inputMono}
                />
              </div>

              <div>
                <label htmlFor="tx-cuenta" className={styles.label}>
                  Cuenta / Billetera
                </label>
                <select
                  id="tx-cuenta"
                  name="cuentaOrigenId"
                  value={cuentaOrigenId}
                  onChange={(e) => setCuentaOrigenId(e.target.value as AccountSource)}
                  className={styles.input}
                >
                  {accounts.length > 0 ? (
                    accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type} - {acc.currency})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Cuenta Nu COP">Cuenta Nu COP - Bancos COP</option>
                      <option value="Billetera Nequi">Billetera Nequi - Billetera Digital</option>
                      <option value="Efectivo Físico">Efectivo Físico - Caja</option>
                      <option value="Interactive Brokers">Interactive Brokers - USD</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Categoría Macro y Subcategoría */}
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="tx-macro" className={styles.label}>
                  Categoría Macro
                </label>
                <select
                  id="tx-macro"
                  name="categoriaMacroId"
                  value={categoriaMacroId}
                  onChange={(e) => setCategoriaMacroId(e.target.value)}
                  className={styles.input}
                >
                  <option value="alimentacion">Alimentación</option>
                  <option value="apartamentos">Apartamentos</option>
                  <option value="transporte">Transporte</option>
                  <option value="hogar">Hogar</option>
                  <option value="entretenimiento">Entretenimiento</option>
                  <option value="trabajo">Trabajo / Ingresos</option>
                  <option value="juegos">Juegos</option>
                  <option value="mercado">Mercado</option>
                  <option value="compras">Compras</option>
                  <option value="salud">Salud</option>
                  <option value="mascotas">Mascotas</option>
                  <option value="donaciones">Donaciones</option>
                  <option value="otros">Otros / Varios</option>
                </select>
              </div>

              <div>
                <label htmlFor="tx-subcat" className={styles.label}>
                  Subcategoría Específica <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="tx-subcat"
                  name="subcategoria"
                  type="text"
                  placeholder="ej. Mercado, Streaming, Cuota apto"
                  value={subcategoria}
                  onChange={(e) => {
                    setSubcategoria(e.target.value);
                    if (errors.subcategoria) setErrors((prev) => ({ ...prev, subcategoria: '' }));
                  }}
                  aria-invalid={!!errors.subcategoria}
                  className={styles.input}
                />
                {errors.subcategoria && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.subcategoria}
                  </p>
                )}
              </div>
            </div>

            {/* Descripción y Recurrente */}
            <div>
              <label htmlFor="tx-desc" className={styles.label}>
                Descripción / Nota Aclaratoria
              </label>
              <input
                id="tx-desc"
                name="descripcion"
                type="text"
                placeholder="Detalle o referencia del movimiento"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.checkboxRow}>
              <input
                id="tx-recurrente"
                type="checkbox"
                checked={esRecurrente}
                onChange={(e) => setEsRecurrente(e.target.checked)}
                className={styles.checkboxEmerald}
              />
              <label htmlFor="tx-recurrente" className={styles.checkboxLabel}>
                Marcar como movimiento fijo recurrente mensual
              </label>
            </div>

            {errors.submit && (
              <p className={styles.errorText}>
                <AlertCircle className={styles.errorIcon} /> {errors.submit}
              </p>
            )}

            {/* Actions */}
            <div className={styles.footerActions}>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className={styles.cancelBtn}
              >
                Cancelar
              </button>

              <button type="submit" disabled={isLoading} className={styles.submitBtnEmerald}>
                {isLoading ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    <span>Guardando en Neon DB...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar Movimiento</span>
                    <ArrowRight className={styles.arrowIcon} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   FORMULARIO 2: REGISTRO / ACTUALIZACIÓN DE ACTIVO, INVERSIÓN O PASIVO
   ========================================================================= */

interface AssetLiabilityFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSuccess?: (payload: AssetLiabilityPayload) => void;
}

export const AssetLiabilityFormModal: React.FC<AssetLiabilityFormProps> = ({
  isOpen,
  onClose,
  onSubmitSuccess,
}) => {
  const queryClient = useQueryClient();
  const [tipoClasificacion, setTipoClasificacion] =
    useState<AssetLiabilityType>('activo_fijo_inversion');
  const [nombreInstrumento, setNombreInstrumento] = useState<string>('');
  const [institucion, setInstitucion] = useState<string>('');
  const [moneda, setMoneda] = useState<CurrencyCode>('COP');
  const [valorMonto, setValorMonto] = useState<string>('');
  const [tasaRendimientoOInteres, setTasaRendimientoOInteres] = useState<string>('');
  const [fechaValoracion, setFechaValoracion] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [esLiquidezInmediata, setEsLiquidezInmediata] = useState<boolean>(false);
  const [notasAclaratorias, setNotasAclaratorias] = useState<string>('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successPayload, setSuccessPayload] = useState<AssetLiabilityPayload | null>(null);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!nombreInstrumento.trim() || nombreInstrumento.trim().length < 3) {
      newErrors.nombreInstrumento =
        'El nombre del activo o deuda debe tener al menos 3 caracteres.';
    }

    if (!institucion.trim()) {
      newErrors.institucion =
        'Indica la entidad o plataforma (ej. Bancolombia, Littio, Protti, S&P500).';
    }

    const val = parseFloat(valorMonto);
    if (!valorMonto || isNaN(val) || val <= 0) {
      newErrors.valorMonto = 'El valor o saldo adeudado debe ser mayor a 0.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setSuccessPayload(null);
    setErrors({});

    const payload: AssetLiabilityPayload = {
      tipoClasificacion,
      nombreInstrumento: nombreInstrumento.trim(),
      institucion: institucion.trim(),
      moneda,
      valorMonto: parseFloat(valorMonto),
      tasaRendimientoOInteres: tasaRendimientoOInteres
        ? parseFloat(tasaRendimientoOInteres)
        : undefined,
      fechaValoracion,
      esLiquidezInmediata,
      notasAclaratorias: notasAclaratorias.trim() || undefined,
    };

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch('/api/patrimony', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo guardar el registro patrimonial.');
      }

      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
      setSuccessPayload(payload);
      if (onSubmitSuccess) onSubmitSuccess(payload);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Error al guardar en Neon DB.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-form-title"
        className={styles.modalCard}
      >
        <div className={styles.topGlowCyan} />

        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBoxCyan}>
              <Building className={styles.headerIcon} />
            </div>
            <div>
              <h2 id="asset-form-title" className={styles.modalTitle}>
                Gestionar Activo, Inversión o Pasivo
              </h2>
              <p className={styles.modalSubtitle}>
                Impacta el cálculo del Balance General y Patrimonio Neto
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar modal" className={styles.closeBtn}>
            <X className={styles.closeIcon} />
          </button>
        </div>

        {successPayload ? (
          <div className={styles.successBlock}>
            <div className={styles.successBannerCyan}>
              <CheckCircle2 className={styles.successIconCyan} />
              <div>
                <h4 className={styles.successTitleCyan}>¡Registro Patrimonial Actualizado!</h4>
                <p className={styles.successDesc}>
                  Se ha recalculado la solvencia patrimonial y la distribución en v_net_worth.
                </p>
              </div>
            </div>

            <div className={styles.payloadBox}>
              <div className={styles.payloadHeader}>
                <span className={styles.payloadLabelCyan}>
                  <Code2 className={styles.smallIcon} /> Payload Guardado en DB
                </span>
                <span className={styles.statusCyan}>Status: 201 Created</span>
              </div>
              <pre className={styles.payloadPre}>{JSON.stringify(successPayload, null, 2)}</pre>
            </div>

            <div className={styles.successActions}>
              <button
                type="button"
                onClick={() => {
                  setSuccessPayload(null);
                  setNombreInstrumento('');
                  setInstitucion('');
                  setValorMonto('');
                }}
                className={styles.secondaryActionBtn}
              >
                Añadir Otro
              </button>
              <button type="button" onClick={onClose} className={styles.doneBtnCyan}>
                Cerrar y Ver Balance
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            {/* Clasificación Patrimonial */}
            <div>
              <label className={styles.labelSpaced}>Clasificación Contable</label>
              <div className={styles.segmentedGrid}>
                <button
                  type="button"
                  onClick={() => {
                    setTipoClasificacion('activo_liquido');
                    setEsLiquidezInmediata(true);
                  }}
                  className={`${styles.segBtn} ${
                    tipoClasificacion === 'activo_liquido' ? styles.segBtnActiveEmerald : ''
                  }`}
                >
                  Activo Líquido
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTipoClasificacion('activo_fijo_inversion');
                    setEsLiquidezInmediata(false);
                  }}
                  className={`${styles.segBtn} ${
                    tipoClasificacion === 'activo_fijo_inversion' ? styles.segBtnActiveCyan : ''
                  }`}
                >
                  Fijo / Inversión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTipoClasificacion('pasivo_deuda');
                    setEsLiquidezInmediata(false);
                  }}
                  className={`${styles.segBtn} ${
                    tipoClasificacion === 'pasivo_deuda' ? styles.segBtnActiveRose : ''
                  }`}
                >
                  Pasivo / Deuda
                </button>
              </div>
            </div>

            {/* Nombre y Entidad */}
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="al-nombre" className={styles.label}>
                  Nombre del Instrumento / Activo <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="al-nombre"
                  type="text"
                  placeholder="ej. Acciones Apple, Hipoteca Apto, Nu Ahorro"
                  value={nombreInstrumento}
                  onChange={(e) => {
                    setNombreInstrumento(e.target.value);
                    if (errors.nombreInstrumento)
                      setErrors((prev) => ({ ...prev, nombreInstrumento: '' }));
                  }}
                  aria-invalid={!!errors.nombreInstrumento}
                  className={styles.inputCyan}
                />
                {errors.nombreInstrumento && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.nombreInstrumento}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="al-entidad" className={styles.label}>
                  Entidad / Custodio <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="al-entidad"
                  type="text"
                  placeholder="ej. Bancolombia, Littio, Protti, Interactive Brokers"
                  value={institucion}
                  onChange={(e) => {
                    setInstitucion(e.target.value);
                    if (errors.institucion) setErrors((prev) => ({ ...prev, institucion: '' }));
                  }}
                  aria-invalid={!!errors.institucion}
                  className={styles.inputCyan}
                />
                {errors.institucion && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.institucion}
                  </p>
                )}
              </div>
            </div>

            {/* Valor y Moneda */}
            <div className={styles.gridAmountRow}>
              <div className={styles.colSpan2}>
                <label htmlFor="al-valor" className={styles.label}>
                  Valor Actual o Saldo Deuda <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="al-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="ej. 357000000"
                  value={valorMonto}
                  onChange={(e) => {
                    setValorMonto(e.target.value);
                    if (errors.valorMonto) setErrors((prev) => ({ ...prev, valorMonto: '' }));
                  }}
                  aria-invalid={!!errors.valorMonto}
                  className={styles.inputMonoCyan}
                />
                {errors.valorMonto && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.valorMonto}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="al-moneda" className={styles.label}>
                  Moneda
                </label>
                <select
                  id="al-moneda"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value as CurrencyCode)}
                  className={styles.inputMonoCyan}
                >
                  <option value="COP">COP ($)</option>
                  <option value="USD">USD (US$)</option>
                </select>
              </div>
            </div>

            {/* Tasa y Fecha */}
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="al-tasa" className={styles.label}>
                  Tasa Anual Estimada (% EA / Interés)
                </label>
                <input
                  id="al-tasa"
                  type="number"
                  step="0.1"
                  placeholder="ej. 13.0 (E.A.) o 11.5 (Tasa Deuda)"
                  value={tasaRendimientoOInteres}
                  onChange={(e) => setTasaRendimientoOInteres(e.target.value)}
                  className={styles.inputMonoCyan}
                />
              </div>

              <div>
                <label htmlFor="al-fecha" className={styles.label}>
                  Fecha de Valoración / Corte
                </label>
                <input
                  id="al-fecha"
                  type="date"
                  value={fechaValoracion}
                  onChange={(e) => setFechaValoracion(e.target.value)}
                  className={styles.inputMonoCyan}
                />
              </div>
            </div>

            {tipoClasificacion === 'activo_liquido' && (
              <div className={styles.checkboxRow}>
                <input
                  id="al-liquido"
                  type="checkbox"
                  checked={esLiquidezInmediata}
                  onChange={(e) => setEsLiquidezInmediata(e.target.checked)}
                  className={styles.checkboxEmerald}
                />
                <label htmlFor="al-liquido" className={styles.checkboxLabel}>
                  Contabilizar como Dinero Disponible T+0 (Liquidez Inmediata en Header)
                </label>
              </div>
            )}

            {errors.submit && (
              <p className={styles.errorText}>
                <AlertCircle className={styles.errorIcon} /> {errors.submit}
              </p>
            )}

            {/* Actions */}
            <div className={styles.footerActions}>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className={styles.cancelBtn}
              >
                Cancelar
              </button>

              <button type="submit" disabled={isLoading} className={styles.submitBtnCyan}>
                {isLoading ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    <span>Actualizando Balance...</span>
                  </>
                ) : (
                  <>
                    <span>Guardar Registro</span>
                    <ArrowRight className={styles.arrowIcon} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   FORMULARIO 3: CIERRE MENSUAL & AJUSTE DE METAS DE AHORRO / TRM
   ========================================================================= */

interface PeriodConfigFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialTrm?: number;
  onSubmitSuccess?: (payload: PeriodConfigPayload) => void;
}

export const PeriodConfigFormModal: React.FC<PeriodConfigFormProps> = ({
  isOpen,
  onClose,
  initialTrm = 3303.16,
  onSubmitSuccess,
}) => {
  const queryClient = useQueryClient();
  const [periodoMesAno, setPeriodoMesAno] = useState<string>('2026-09');
  const [trmOficialCopUsd, setTrmOficialCopUsd] = useState<string>(String(initialTrm));
  const [tasaAhorroMetaPorcentaje, setTasaAhorroMetaPorcentaje] = useState<string>('20');
  const [limiteGastosPresupuestoCop, setLimiteGastosPresupuestoCop] = useState<string>('8000000');
  const [sincronizarConCalcData, setSincronizarConCalcData] = useState<boolean>(true);
  const [observacionesCierre, setObservacionesCierre] = useState<string>('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successPayload, setSuccessPayload] = useState<PeriodConfigPayload | null>(null);

  useEffect(() => {
    if (initialTrm) {
      setTrmOficialCopUsd(String(initialTrm));
    }
  }, [initialTrm]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    const trm = parseFloat(trmOficialCopUsd);
    if (!trmOficialCopUsd || isNaN(trm) || trm <= 1000 || trm >= 10000) {
      newErrors.trmOficialCopUsd =
        'Ingresa una TRM válida para Colombia (entre $1.000 y $10.000 COP).';
    }

    const meta = parseFloat(tasaAhorroMetaPorcentaje);
    if (isNaN(meta) || meta < 0 || meta > 100) {
      newErrors.tasaAhorroMetaPorcentaje =
        'La meta de ahorro debe ser un porcentaje entre 0% y 100%.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setSuccessPayload(null);
    setErrors({});

    const payload: PeriodConfigPayload = {
      periodoMesAno,
      trmOficialCopUsd: parseFloat(trmOficialCopUsd),
      tasaAhorroMetaPorcentaje: parseFloat(tasaAhorroMetaPorcentaje),
      limiteGastosPresupuestoCop: parseFloat(limiteGastosPresupuestoCop) || 0,
      sincronizarConCalcData,
      observacionesCierre: observacionesCierre.trim() || undefined,
    };

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo actualizar la configuración.');
      }

      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
      setSuccessPayload(payload);
      if (onSubmitSuccess) onSubmitSuccess(payload);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Error al actualizar TRM en Neon DB.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="period-form-title"
        className={styles.modalCard}
      >
        <div className={styles.topGlowPurple} />

        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBoxPurple}>
              <Sparkles className={styles.headerIcon} />
            </div>
            <div>
              <h2 id="period-form-title" className={styles.modalTitle}>
                Configurar Período, Metas & TRM
              </h2>
              <p className={styles.modalSubtitle}>
                Parámetros del motor de consolidación financiera
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar modal" className={styles.closeBtn}>
            <X className={styles.closeIcon} />
          </button>
        </div>

        {successPayload ? (
          <div className={styles.successBlock}>
            <div className={styles.successBannerPurple}>
              <CheckCircle2 className={styles.successIconPurple} />
              <div>
                <h4 className={styles.successTitlePurple}>¡Período y TRM Sincronizados!</h4>
                <p className={styles.successDesc}>
                  Las cuentas en dólares y el valor consolidado se actualizaron en user_settings con
                  la nueva TRM (${successPayload.trmOficialCopUsd} COP).
                </p>
              </div>
            </div>

            <div className={styles.payloadBox}>
              <div className={styles.payloadHeader}>
                <span className={styles.payloadLabelPurple}>
                  <Code2 className={styles.smallIcon} /> Payload Guardado en DB
                </span>
                <span className={styles.statusPurple}>Status: 200 OK</span>
              </div>
              <pre className={styles.payloadPre}>{JSON.stringify(successPayload, null, 2)}</pre>
            </div>

            <div className={styles.successActions}>
              <button type="button" onClick={onClose} className={styles.doneBtnPurple}>
                Aplicar y Ver Dashboard
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="cfg-periodo" className={styles.label}>
                  Mes / Período
                </label>
                <input
                  id="cfg-periodo"
                  type="month"
                  value={periodoMesAno}
                  onChange={(e) => setPeriodoMesAno(e.target.value)}
                  className={styles.inputMonoPurple}
                />
              </div>

              <div>
                <label htmlFor="cfg-trm" className={styles.label}>
                  TRM de Conversión (COP / USD) <span className={styles.requiredStar}>*</span>
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="cfg-trm"
                    type="number"
                    step="0.01"
                    placeholder="3354.00"
                    value={trmOficialCopUsd}
                    onChange={(e) => {
                      setTrmOficialCopUsd(e.target.value);
                      if (errors.trmOficialCopUsd)
                        setErrors((prev) => ({ ...prev, trmOficialCopUsd: '' }));
                    }}
                    aria-invalid={!!errors.trmOficialCopUsd}
                    className={styles.inputMonoPurple}
                  />
                </div>
                {errors.trmOficialCopUsd && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.trmOficialCopUsd}
                  </p>
                )}
              </div>
            </div>

            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="cfg-meta" className={styles.label}>
                  Meta de Ahorro Mensual (%)
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="cfg-meta"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="20"
                    value={tasaAhorroMetaPorcentaje}
                    onChange={(e) => setTasaAhorroMetaPorcentaje(e.target.value)}
                    className={styles.inputMonoPurple}
                  />
                  <span className={styles.percentSuffix}>%</span>
                </div>
              </div>

              <div>
                <label htmlFor="cfg-presupuesto" className={styles.label}>
                  Límite de Presupuesto Gastos (COP)
                </label>
                <input
                  id="cfg-presupuesto"
                  type="number"
                  step="1000"
                  placeholder="8000000"
                  value={limiteGastosPresupuestoCop}
                  onChange={(e) => setLimiteGastosPresupuestoCop(e.target.value)}
                  className={styles.inputMonoPurple}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cfg-obs" className={styles.label}>
                Observaciones del Cierre Mensual
              </label>
              <textarea
                id="cfg-obs"
                rows={2}
                placeholder="Notas de balance, metas cumplidas o ajustes de cartera"
                value={observacionesCierre}
                onChange={(e) => setObservacionesCierre(e.target.value)}
                className={styles.textareaPurple}
              />
            </div>

            <div className={styles.checkboxRow}>
              <input
                id="cfg-sync"
                type="checkbox"
                checked={sincronizarConCalcData}
                onChange={(e) => setSincronizarConCalcData(e.target.checked)}
                className={styles.checkboxPurple}
              />
              <label htmlFor="cfg-sync" className={styles.checkboxLabel}>
                Sincronizar automáticamente vistas de Neon DB al guardar
              </label>
            </div>

            {errors.submit && (
              <p className={styles.errorText}>
                <AlertCircle className={styles.errorIcon} /> {errors.submit}
              </p>
            )}

            {/* Actions */}
            <div className={styles.footerActions}>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className={styles.cancelBtn}
              >
                Cancelar
              </button>

              <button type="submit" disabled={isLoading} className={styles.submitBtnPurple}>
                {isLoading ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    <span>Actualizando Período...</span>
                  </>
                ) : (
                  <>
                    <span>Guardar Configuración</span>
                    <ArrowRight className={styles.arrowIcon} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   FORMULARIO 4: CREACIÓN DE NUEVA CUENTA / BILLETERA / BROKER (TABLA ACCOUNTS)
   ========================================================================= */

interface AccountFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitSuccess?: (payload: AccountPayload) => void;
}

export const AccountFormModal: React.FC<AccountFormProps> = ({
  isOpen,
  onClose,
  onSubmitSuccess,
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<AccountType>('Banco');
  const [currency, setCurrency] = useState<CurrencyCode>('COP');
  const [initialBalance, setInitialBalance] = useState<string>('0');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successPayload, setSuccessPayload] = useState<AccountPayload | null>(null);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Ingresa un nombre de cuenta válido (mínimo 2 caracteres).';
    }

    const numericBalance = parseFloat(initialBalance);
    if (initialBalance === '' || isNaN(numericBalance) || numericBalance < 0) {
      newErrors.initialBalance = 'El saldo inicial / actual debe ser un número mayor o igual a 0.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setSuccessPayload(null);
    setErrors({});

    const numericBalance = parseFloat(initialBalance);

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          type,
          currency,
          initialBalance: numericBalance,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo crear la cuenta en Neon DB.');
      }

      const payload: AccountPayload = {
        id: result.account?.id,
        name: name.trim(),
        type,
        currency,
        initialBalance: numericBalance,
      };

      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
      setSuccessPayload(payload);
      if (onSubmitSuccess) onSubmitSuccess(payload);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Error al crear la cuenta en Neon DB.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-form-title"
        className={styles.modalCard}
      >
        <div className={styles.topGlowEmerald} />

        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBoxEmerald}>
              <Wallet className={styles.headerIcon} />
            </div>
            <div>
              <h2 id="account-form-title" className={styles.modalTitle}>
                Crear Nueva Cuenta / Billetera
              </h2>
              <p className={styles.modalSubtitle}>
                Define el nombre, tipo, moneda y saldo actual en Neon DB
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar modal" className={styles.closeBtn}>
            <X className={styles.closeIcon} />
          </button>
        </div>

        {successPayload ? (
          <div className={styles.successBlock}>
            <div className={styles.successBannerEmerald}>
              <CheckCircle2 className={styles.successIconEmerald} />
              <div>
                <h4 className={styles.successTitleEmerald}>¡Cuenta Creada Exitosamente!</h4>
                <p className={styles.successDesc}>
                  La cuenta <strong>{successPayload.name}</strong> ya está disponible para registrar
                  movimientos y se sumó a la liquidez del Canvas.
                </p>
              </div>
            </div>

            <div className={styles.payloadBox}>
              <div className={styles.payloadHeader}>
                <span className={styles.payloadLabelCyan}>
                  <Code2 className={styles.smallIcon} /> Cuenta Guardada en DB
                </span>
                <span className={styles.statusEmerald}>Status: 201 Created</span>
              </div>
              <pre className={styles.payloadPre}>{JSON.stringify(successPayload, null, 2)}</pre>
            </div>

            <div className={styles.successActions}>
              <button
                type="button"
                onClick={() => {
                  setSuccessPayload(null);
                  setName('');
                  setInitialBalance('0');
                }}
                className={styles.secondaryActionBtn}
              >
                Crear Otra Cuenta
              </button>
              <button type="button" onClick={onClose} className={styles.doneBtnEmerald}>
                Listo / Volver al Canvas
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="acc-name" className={styles.label}>
                  Nombre de la Cuenta <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="acc-name"
                  type="text"
                  placeholder="ej. Cuenta Nu COP, Billetera Nequi, Efectivo"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  aria-invalid={!!errors.name}
                  className={styles.input}
                />
                {errors.name && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="acc-type" className={styles.label}>
                  Tipo de Cuenta
                </label>
                <select
                  id="acc-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as AccountType)}
                  className={styles.input}
                >
                  <option value="Banco">Banco (Operativa)</option>
                  <option value="Billetera Digital">Billetera Digital (Nequi / Daviplata)</option>
                  <option value="Efectivo">Efectivo Físico (Caja en mano)</option>
                  <option value="Ahorro">Cuenta de Ahorro (Cajitas / Bolsillos)</option>
                  <option value="Broker">Broker Internacional / Acciones</option>
                  <option value="Inversión">Fondo de Inversión</option>
                </select>
              </div>
            </div>

            <div className={styles.gridAmountRow}>
              <div className={styles.colSpan2}>
                <label htmlFor="acc-balance" className={styles.label}>
                  Saldo Inicial / Valor Actual <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="acc-balance"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="ej. 1000000"
                  value={initialBalance}
                  onChange={(e) => {
                    setInitialBalance(e.target.value);
                    if (errors.initialBalance)
                      setErrors((prev) => ({ ...prev, initialBalance: '' }));
                  }}
                  aria-invalid={!!errors.initialBalance}
                  className={styles.inputMono}
                />
                {errors.initialBalance && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.initialBalance}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="acc-currency" className={styles.label}>
                  Moneda
                </label>
                <select
                  id="acc-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className={styles.inputMono}
                >
                  <option value="COP">COP ($)</option>
                  <option value="USD">USD (US$)</option>
                </select>
              </div>
            </div>

            {errors.submit && (
              <p className={styles.errorText}>
                <AlertCircle className={styles.errorIcon} /> {errors.submit}
              </p>
            )}

            <div className={styles.footerActions}>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className={styles.cancelBtn}
              >
                Cancelar
              </button>

              <button type="submit" disabled={isLoading} className={styles.submitBtnEmerald}>
                {isLoading ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    <span>Creando Cuenta...</span>
                  </>
                ) : (
                  <>
                    <span>Crear Cuenta</span>
                    <ArrowRight className={styles.arrowIcon} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
