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
  TrendingUp,
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

interface CategoryGroup {
  name: string;
  dbType: string;
  subcategories: string[];
}

const CATEGORIES_BY_TYPE: Record<TransactionType, CategoryGroup[]> = {
  gasto: [
    {
      name: 'Alimentación',
      dbType: 'GASTO',
      subcategories: ['Restaurante', 'Domicilios', 'Cafés / Snacks'],
    },
    {
      name: 'Mercado',
      dbType: 'GASTO',
      subcategories: ['Mercado'],
    },
    {
      name: 'Apartamentos',
      dbType: 'GASTO',
      subcategories: ['Cuota apto', 'Impuestos / Predial'],
    },
    {
      name: 'Vivienda',
      dbType: 'GASTO',
      subcategories: [
        'Administración',
        'Servicios públicos',
        'Internet / Telefonía',
        'Mantenimiento / Reparaciones',
      ],
    },
    {
      name: 'Hogar',
      dbType: 'GASTO',
      subcategories: ['Electrodomesticos', 'Muebles / Hogar'],
    },
    {
      name: 'Transporte',
      dbType: 'GASTO',
      subcategories: [
        'Combustible',
        'Parqueadero',
        'Peajes',
        'Transporte público',
        'Revision carro',
        'Arreglos auto',
        'Uber',
        'SOAT / Seguro / Impuestos',
        'Otros transporte',
      ],
    },
    {
      name: 'Viajes',
      dbType: 'GASTO',
      subcategories: [
        'Pasajes',
        'Hoteles',
        'Comida',
        'Museos / Actividades',
        'Transporte en viaje',
        'Otros viaje',
      ],
    },
    {
      name: 'Suscripciones',
      dbType: 'GASTO',
      subcategories: ['Streaming', 'Spotify', 'Apple', 'Software / IA', 'Otras suscripciones'],
    },
    {
      name: 'Entretenimiento',
      dbType: 'GASTO',
      subcategories: ['Cine', 'Eventos', 'Ocio', 'Conciertos', 'Otros entretenimiento'],
    },
    {
      name: 'Juegos',
      dbType: 'GASTO',
      subcategories: ['Videojuegos', 'Juegos de mesa'],
    },
    {
      name: 'Mascotas',
      dbType: 'GASTO',
      subcategories: ['Comida gatos', 'Arena', 'Veterinario', 'Accesorios', 'Otros mascotas'],
    },
    {
      name: 'Salud',
      dbType: 'GASTO',
      subcategories: ['Medicamentos', 'Consultas', 'Odontologia', 'Otros salud'],
    },
    {
      name: 'Personales',
      dbType: 'GASTO',
      subcategories: [
        'Cuidado personal',
        'Educación',
        'Gimnasio / Deporte',
        'Otros personales',
      ],
    },
    {
      name: 'Compras',
      dbType: 'GASTO',
      subcategories: ['Ropa y accesorios', 'Tecnología', 'Regalos', 'Otros compras'],
    },
    {
      name: 'Donaciones',
      dbType: 'GASTO',
      subcategories: ['Donaciones'],
    },
    {
      name: 'Otros',
      dbType: 'GASTO',
      subcategories: ['Otros gastos'],
    },
  ],
  ingreso: [
    {
      name: 'Ingresos Fijos',
      dbType: 'INGRESO_FIJO',
      subcategories: ['Salario', 'Arriendo'],
    },
    {
      name: 'Ingresos Variables',
      dbType: 'INGRESO_VARIABLE',
      subcategories: [
        'Otros ingresos variables',
        'Bonos / Comisiones',
        'Reembolsos / Devoluciones',
        'Rendimientos',
      ],
    },
  ],
  ahorro_inversion: [
    {
      name: 'Ahorro',
      dbType: 'AHORRO',
      subcategories: ['Ahorro COP', 'Ahorro USD', 'Fondo de emergencia'],
    },
    {
      name: 'Inversión',
      dbType: 'INVERSION',
      subcategories: ['Acciones / ETFs', 'CDT / Renta fija', 'Inversión inmobiliaria'],
    },
  ],
  transferencia: [
    {
      name: 'Transferencia',
      dbType: 'TRANSFERENCIA',
      subcategories: ['Pago Tarjeta de Crédito', 'Traspaso entre Cuentas'],
    },
  ],
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

export interface EditableTransaction {
  id: string;
  date: string;
  description: string;
  amount: string | number;
  destination_amount?: string | number | null;
  currency: string;
  category_type: string;
  category_name: string;
  sub_category_name: string;
  account_id: string;
  destination_account_id?: string | null;
  is_recurring?: boolean;
}

export interface InitialTransactionDraft {
  tipo?: TransactionType;
  monto?: number | string;
  moneda?: CurrencyCode;
  cuentaOrigenId?: string;
  cuentaDestinoId?: string;
  categoriaMacroId?: string;
  subcategoria?: string;
  descripcion?: string;
}

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  accounts?: AccountOption[];
  trm?: number;
  editingTransaction?: EditableTransaction | null;
  initialDraft?: InitialTransactionDraft | null;
  onSubmitSuccess?: (payload: TransactionPayload) => void;
}

function mapDbCategoryTypeToUiType(dbType: string): TransactionType {
  if (dbType === 'INGRESO_FIJO' || dbType === 'INGRESO_VARIABLE') return 'ingreso';
  if (dbType === 'AHORRO' || dbType === 'INVERSION') return 'ahorro_inversion';
  if (dbType === 'TRANSFERENCIA') return 'transferencia';
  return 'gasto';
}

export const TransactionFormModal: React.FC<TransactionFormProps> = ({
  isOpen,
  onClose,
  accounts = [],
  trm = 3303.16,
  editingTransaction = null,
  initialDraft = null,
  onSubmitSuccess,
}) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(editingTransaction?.id);
  const [tipo, setTipo] = useState<TransactionType>('gasto');
  const [monto, setMonto] = useState<string>('');
  const [montoDestino, setMontoDestino] = useState<string>('');
  const [moneda, setMoneda] = useState<CurrencyCode>('COP');
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [cuentaOrigenId, setCuentaOrigenId] = useState<AccountSource>(
    accounts[0]?.id || 'Cuenta Nu COP'
  );
  const [cuentaDestinoId, setCuentaDestinoId] = useState<AccountSource>('');
  const [categoriaMacroId, setCategoriaMacroId] = useState<string>('Alimentación');
  const [subcategoria, setSubcategoria] = useState<string>('Restaurante');
  const [descripcion, setDescripcion] = useState<string>('');
  const [esRecurrente, setEsRecurrente] = useState<boolean>(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successPayload, setSuccessPayload] = useState<TransactionPayload | null>(null);

  const availableCategories = CATEGORIES_BY_TYPE[tipo] || CATEGORIES_BY_TYPE.gasto;
  const selectedCategoryGroup =
    availableCategories.find((c) => c.name === categoriaMacroId) || availableCategories[0];
  const availableSubcategories = selectedCategoryGroup?.subcategories || [];

  const originAccount = accounts.find((a) => a.id === cuentaOrigenId);
  const destAccount =
    (tipo === 'transferencia' || tipo === 'ahorro_inversion') && cuentaDestinoId
      ? accounts.find((a) => a.id === cuentaDestinoId)
      : undefined;
  const isCrossCurrency = Boolean(
    originAccount &&
      destAccount &&
      originAccount.currency &&
      destAccount.currency &&
      originAccount.currency !== destAccount.currency
  );

  const handleTipoChange = (newTipo: TransactionType) => {
    setTipo(newTipo);
    const firstCategory = CATEGORIES_BY_TYPE[newTipo]?.[0];
    if (firstCategory) {
      setCategoriaMacroId(firstCategory.name);
      setSubcategoria(firstCategory.subcategories[0] || '');
    }
    if (newTipo === 'transferencia' && accounts.length > 0) {
      const creditCardAcc = accounts.find((a) =>
        a.type.toLowerCase().includes('tarjeta')
      );
      const nonCreditAcc = accounts.find(
        (a) => !a.type.toLowerCase().includes('tarjeta')
      );
      if (nonCreditAcc) {
        setCuentaOrigenId(nonCreditAcc.id);
      }
      if (creditCardAcc) {
        setCuentaDestinoId(creditCardAcc.id);
      } else {
        const alternative = accounts.find((a) => a.id !== cuentaOrigenId);
        setCuentaDestinoId(alternative?.id || accounts[0].id);
      }
    } else if (newTipo === 'ahorro_inversion' && accounts.length > 0) {
      const savingsAcc = accounts.find(
        (a) => a.name.toLowerCase().includes('ahorro') && a.id !== cuentaOrigenId
      );
      setCuentaDestinoId(savingsAcc ? savingsAcc.id : '');
    }
  };

  const handleCategoryChange = (newCategoryName: string) => {
    setCategoriaMacroId(newCategoryName);
    const found = availableCategories.find((c) => c.name === newCategoryName);
    if (found) {
      setSubcategoria(found.subcategories[0] || '');
    }
    if (errors.subcategoria) {
      setErrors((prev) => ({ ...prev, subcategoria: '' }));
    }
  };

  useEffect(() => {
    if (accounts.length > 0 && (!cuentaOrigenId || cuentaOrigenId === 'Cuenta Nu COP')) {
      setCuentaOrigenId(accounts[0].id);
    }
    if (accounts.length > 0 && !cuentaDestinoId && tipo === 'transferencia') {
      const creditCardAcc = accounts.find((a) =>
        a.type.toLowerCase().includes('tarjeta')
      );
      const secondAcc = accounts.find((a) => a.id !== accounts[0].id);
      setCuentaDestinoId(creditCardAcc?.id || secondAcc?.id || accounts[0].id);
    }
  }, [accounts, cuentaOrigenId, cuentaDestinoId, tipo]);

  useEffect(() => {
    if (!isOpen) return;
    setSuccessPayload(null);
    setErrors({});

    if (editingTransaction) {
      const mappedTipo = mapDbCategoryTypeToUiType(editingTransaction.category_type);
      setTipo(mappedTipo);
      setMonto(String(Number(editingTransaction.amount)));
      setMontoDestino(
        editingTransaction.destination_amount !== null &&
          editingTransaction.destination_amount !== undefined
          ? String(Number(editingTransaction.destination_amount))
          : ''
      );
      setMoneda(editingTransaction.currency === 'USD' ? 'USD' : 'COP');
      setFecha(editingTransaction.date || new Date().toISOString().split('T')[0]);
      setCuentaOrigenId(
        (editingTransaction.account_id || accounts[0]?.id || 'Cuenta Nu COP') as AccountSource
      );
      setCuentaDestinoId((editingTransaction.destination_account_id || '') as AccountSource);
      setCategoriaMacroId(editingTransaction.category_name || 'Alimentación');
      setSubcategoria(editingTransaction.sub_category_name || 'Restaurante');
      setDescripcion(editingTransaction.description || '');
      setEsRecurrente(Boolean(editingTransaction.is_recurring));
    } else if (initialDraft) {
      const draftTipo = initialDraft.tipo || 'gasto';
      setTipo(draftTipo);
      setMonto(initialDraft.monto !== undefined ? String(initialDraft.monto) : '');
      setMontoDestino('');
      setMoneda(initialDraft.moneda || 'COP');
      setFecha(new Date().toISOString().split('T')[0]);
      if (initialDraft.cuentaOrigenId) {
        setCuentaOrigenId(initialDraft.cuentaOrigenId);
      } else if (accounts[0]?.id) {
        setCuentaOrigenId(accounts[0].id);
      }
      if (initialDraft.cuentaDestinoId) {
        setCuentaDestinoId(initialDraft.cuentaDestinoId);
      }
      const defaultCatGroup =
        CATEGORIES_BY_TYPE[draftTipo]?.find((c) => c.name === initialDraft.categoriaMacroId) ||
        CATEGORIES_BY_TYPE[draftTipo]?.[0];
      setCategoriaMacroId(defaultCatGroup?.name || 'Alimentación');
      setSubcategoria(
        initialDraft.subcategoria || defaultCatGroup?.subcategories[0] || 'Restaurante'
      );
      setDescripcion(initialDraft.descripcion || '');
      setEsRecurrente(false);
    } else {
      setTipo('gasto');
      setMonto('');
      setMontoDestino('');
      setMoneda('COP');
      setFecha(new Date().toISOString().split('T')[0]);
      if (accounts[0]?.id) {
        setCuentaOrigenId(accounts[0].id);
      }
      setCategoriaMacroId('Alimentación');
      setSubcategoria('Restaurante');
      setDescripcion('');
      setEsRecurrente(false);
    }
  }, [isOpen, editingTransaction, initialDraft, accounts]);

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

    if (tipo === 'transferencia') {
      if (!cuentaDestinoId) {
        newErrors.cuentaDestinoId = 'Debes seleccionar la cuenta de destino.';
      } else if (cuentaDestinoId === cuentaOrigenId) {
        newErrors.cuentaDestinoId = 'La cuenta de origen y destino deben ser diferentes.';
      }
    } else if (tipo === 'ahorro_inversion' && cuentaDestinoId && cuentaDestinoId === cuentaOrigenId) {
      newErrors.cuentaDestinoId = 'La cuenta de origen y destino deben ser diferentes.';
    }

    if (isCrossCurrency) {
      const numericDestAmount = parseFloat(montoDestino);
      if (!montoDestino || isNaN(numericDestAmount) || numericDestAmount <= 0) {
        newErrors.montoDestino = `Indica cuántos ${destAccount?.currency || 'USD'} recibiste en ${destAccount?.name || 'la cuenta destino'}.`;
      }
    }

    if (!subcategoria.trim() || subcategoria.trim().length < 2) {
      newErrors.subcategoria = 'Debes seleccionar una subcategoría válida.';
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

    const categoryName = selectedCategoryGroup.name;
    const categoryType = selectedCategoryGroup.dbType;
    const numericAmount = parseFloat(monto);
    const effectiveDestinationAccountId =
      (tipo === 'transferencia' || tipo === 'ahorro_inversion') && cuentaDestinoId
        ? cuentaDestinoId
        : undefined;
    const effectiveDestinationAmount =
      effectiveDestinationAccountId && isCrossCurrency ? parseFloat(montoDestino) : undefined;

    try {
      const headers = await buildAuthHeaders();
      const endpoint =
        isEditing && editingTransaction
          ? `/api/transactions/${encodeURIComponent(editingTransaction.id)}`
          : '/api/transactions';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify({
          accountId: cuentaOrigenId,
          destinationAccountId: effectiveDestinationAccountId,
          date: fecha,
          amount: numericAmount,
          destinationAmount: effectiveDestinationAmount,
          currency: moneda,
          categoryType,
          categoryName,
          subCategoryName: subcategoria.trim(),
          description: descripcion.trim() || null,
          isRecurring: esRecurrente,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error ||
            (isEditing
              ? 'No se pudo actualizar la transacción en Neon DB.'
              : 'No se pudo guardar la transacción en Neon DB.')
        );
      }

      const payload: TransactionPayload = {
        tipo,
        monto: numericAmount,
        montoDestino: effectiveDestinationAmount,
        moneda,
        fecha,
        cuentaOrigenId,
        cuentaDestinoId: effectiveDestinationAccountId,
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
        submit:
          err instanceof Error
            ? err.message
            : isEditing
              ? 'Error al actualizar la transacción.'
              : 'Error al registrar la transacción.',
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
                {isEditing
                  ? 'Editar Movimiento en Flujo de Caja'
                  : 'Registrar Movimiento en Flujo de Caja'}
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
                  {isEditing
                    ? '¡Transacción Actualizada Exitosamente!'
                    : '¡Transacción Registrada Exitosamente!'}
                </h4>
                <p className={styles.successDesc}>
                  {isEditing
                    ? 'Los cambios fueron guardados en Neon DB y el saldo de la cuenta fue reajustado.'
                    : 'El movimiento ha sido consolidado en Neon DB y el saldo de la cuenta se actualizó.'}
                </p>
              </div>
            </div>

            <div className={styles.payloadBox}>
              <div className={styles.payloadHeader}>
                <span className={styles.payloadLabelCyan}>
                  <Code2 className={styles.smallIcon} /> Payload Guardado en DB
                </span>
                <span className={styles.statusEmerald}>
                  {isEditing ? 'Status: 200 Updated' : 'Status: 201 Created'}
                </span>
              </div>
              <pre className={styles.payloadPre}>{JSON.stringify(successPayload, null, 2)}</pre>
            </div>

            <div className={styles.successActions}>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setSuccessPayload(null);
                    setMonto('');
                    setMontoDestino('');
                    setDescripcion('');
                  }}
                  className={styles.secondaryActionBtn}
                >
                  Registrar Otro
                </button>
              )}
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
              <div className={styles.segmentedGridFour}>
                <button
                  type="button"
                  onClick={() => handleTipoChange('gasto')}
                  className={`${styles.segBtn} ${
                    tipo === 'gasto' ? styles.segBtnActiveRose : ''
                  }`}
                >
                  Gasto / Egreso
                </button>
                <button
                  type="button"
                  onClick={() => handleTipoChange('ingreso')}
                  className={`${styles.segBtn} ${
                    tipo === 'ingreso' ? styles.segBtnActiveEmerald : ''
                  }`}
                >
                  Ingreso Operativo
                </button>
                <button
                  type="button"
                  onClick={() => handleTipoChange('ahorro_inversion')}
                  className={`${styles.segBtn} ${
                    tipo === 'ahorro_inversion' ? styles.segBtnActiveCyan : ''
                  }`}
                >
                  Ahorro / Inversión
                </button>
                <button
                  type="button"
                  onClick={() => handleTipoChange('transferencia')}
                  className={`${styles.segBtn} ${
                    tipo === 'transferencia' ? styles.segBtnActivePurple : ''
                  }`}
                >
                  Pago TC / Traspaso
                </button>
              </div>
            </div>

            {/* Monto y Moneda */}
            <div className={styles.gridAmountRow}>
              <div className={styles.colSpan2}>
                <label htmlFor="tx-monto" className={styles.label}>
                  {isCrossCurrency
                    ? `Monto que sale de ${originAccount?.name} (${originAccount?.currency})`
                    : 'Monto'}{' '}
                  <span className={styles.requiredStar}>*</span>
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
                  {tipo === 'transferencia' || tipo === 'ahorro_inversion'
                    ? 'Cuenta Origen (De donde sale el dinero)'
                    : 'Cuenta / Billetera / Tarjeta'}
                </label>
                <select
                  id="tx-cuenta"
                  name="cuentaOrigenId"
                  value={cuentaOrigenId}
                  onChange={(e) => {
                    const nextOriginId = e.target.value as AccountSource;
                    setCuentaOrigenId(nextOriginId);
                    const nextOriginAcc = accounts.find((a) => a.id === nextOriginId);
                    if (nextOriginAcc?.currency === 'USD' || nextOriginAcc?.currency === 'COP') {
                      setMoneda(nextOriginAcc.currency);
                    }
                    if (errors.cuentaDestinoId) {
                      setErrors((prev) => ({ ...prev, cuentaDestinoId: '' }));
                    }
                  }}
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

            {(tipo === 'transferencia' || tipo === 'ahorro_inversion') && (
              <div>
                <label htmlFor="tx-cuenta-destino" className={styles.label}>
                  {tipo === 'ahorro_inversion' ? (
                    'Cuenta Destino (A donde entra el ahorro / inversión)'
                  ) : (
                    <>
                      Cuenta Destino / Tarjeta a Pagar <span className={styles.requiredStar}>*</span>
                    </>
                  )}
                </label>
                <select
                  id="tx-cuenta-destino"
                  name="cuentaDestinoId"
                  value={cuentaDestinoId}
                  onChange={(e) => {
                    setCuentaDestinoId(e.target.value as AccountSource);
                    if (errors.cuentaDestinoId) {
                      setErrors((prev) => ({ ...prev, cuentaDestinoId: '' }));
                    }
                    if (errors.montoDestino) {
                      setErrors((prev) => ({ ...prev, montoDestino: '' }));
                    }
                  }}
                  aria-invalid={!!errors.cuentaDestinoId}
                  className={styles.inputPurple}
                >
                  {tipo === 'ahorro_inversion' && (
                    <option value="">
                      — Sin cuenta destino (solo descontar de cuenta origen) —
                    </option>
                  )}
                  {accounts.length > 0 ? (
                    accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type} - {acc.currency})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="TC Nu">TC Nu - Tarjeta de crédito</option>
                      <option value="Cuenta Nu COP">Cuenta Nu COP - Bancos COP</option>
                    </>
                  )}
                </select>
                {errors.cuentaDestinoId && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.cuentaDestinoId}
                  </p>
                )}
              </div>
            )}

            {isCrossCurrency && destAccount && (
              <div>
                <label htmlFor="tx-monto-destino" className={styles.label}>
                  Monto recibido en {destAccount.name} ({destAccount.currency}){' '}
                  <span className={styles.requiredStar}>*</span>
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="tx-monto-destino"
                    name="montoDestino"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={
                      destAccount.currency === 'USD' ? 'ej. 632.45' : 'ej. 2000000'
                    }
                    value={montoDestino}
                    onChange={(e) => {
                      setMontoDestino(e.target.value);
                      if (errors.montoDestino) {
                        setErrors((prev) => ({ ...prev, montoDestino: '' }));
                      }
                    }}
                    aria-invalid={!!errors.montoDestino}
                    className={styles.inputMono}
                  />
                </div>
                {(() => {
                  const numOrig = parseFloat(monto);
                  const numDest = parseFloat(montoDestino);
                  if (numOrig > 0 && numDest > 0) {
                    const impliedRate =
                      originAccount?.currency === 'COP'
                        ? numOrig / numDest
                        : numDest / numOrig;
                    return (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '0.75rem',
                          color: '#38bdf8',
                        }}
                      >
                        💱 Conversión: {originAccount?.currency === 'COP' ? '$' : 'US$'}{' '}
                        {numOrig.toLocaleString('es-CO', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {originAccount?.currency} ➔{' '}
                        {destAccount.currency === 'USD' ? 'US$' : '$'}{' '}
                        {numDest.toLocaleString('es-CO', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {destAccount.currency} (Tasa implícita: ${' '}
                        {impliedRate.toLocaleString('es-CO', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        COP/USD)
                      </p>
                    );
                  }
                  return null;
                })()}
                {errors.montoDestino && (
                  <p className={styles.errorText}>
                    <AlertCircle className={styles.errorIcon} /> {errors.montoDestino}
                  </p>
                )}
              </div>
            )}

            {/* Categoría Macro y Subcategoría */}
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="tx-macro" className={styles.label}>
                  Categoría
                </label>
                <select
                  id="tx-macro"
                  name="categoriaMacroId"
                  value={selectedCategoryGroup?.name || ''}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className={styles.input}
                >
                  {availableCategories.map((cat) => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tx-subcat" className={styles.label}>
                  Subcategoría Específica <span className={styles.requiredStar}>*</span>
                </label>
                <select
                  id="tx-subcat"
                  name="subcategoria"
                  value={subcategoria}
                  onChange={(e) => {
                    setSubcategoria(e.target.value);
                    if (errors.subcategoria) setErrors((prev) => ({ ...prev, subcategoria: '' }));
                  }}
                  aria-invalid={!!errors.subcategoria}
                  className={styles.input}
                >
                  {availableSubcategories.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
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
                    <span>{isEditing ? 'Guardar Cambios' : 'Confirmar Movimiento'}</span>
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

export interface EditablePatrimonyItem {
  id: string;
  tipoClasificacion: 'activo_fijo_inversion' | 'pasivo_deuda';
  name: string;
  type: string;
  currency: CurrencyCode;
  amount: number;
  originalAmount?: number;
  interestRate?: number;
}

interface AssetLiabilityFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem?: EditablePatrimonyItem | null;
  existingAssets?: EditablePatrimonyItem[];
  existingLiabilities?: EditablePatrimonyItem[];
  onSubmitSuccess?: (payload: AssetLiabilityPayload) => void;
}

export const AssetLiabilityFormModal: React.FC<AssetLiabilityFormProps> = ({
  isOpen,
  onClose,
  editingItem = null,
  existingAssets = [],
  existingLiabilities = [],
  onSubmitSuccess,
}) => {
  const queryClient = useQueryClient();
  const [activeEditId, setActiveEditId] = useState<string>('');
  const [tipoClasificacion, setTipoClasificacion] =
    useState<AssetLiabilityType>('activo_fijo_inversion');
  const [nombreInstrumento, setNombreInstrumento] = useState<string>('');
  const [institucion, setInstitucion] = useState<string>('');
  const [moneda, setMoneda] = useState<CurrencyCode>('COP');
  const [valorMonto, setValorMonto] = useState<string>('');
  const [montoOriginal, setMontoOriginal] = useState<string>('');
  const [tasaRendimientoOInteres, setTasaRendimientoOInteres] = useState<string>('');
  const [fechaValoracion, setFechaValoracion] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [esLiquidezInmediata, setEsLiquidezInmediata] = useState<boolean>(false);
  const [notasAclaratorias, setNotasAclaratorias] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successPayload, setSuccessPayload] = useState<AssetLiabilityPayload | null>(null);

  const loadItemIntoForm = (item: EditablePatrimonyItem | null) => {
    setConfirmDelete(false);
    setErrors({});
    if (!item) {
      setActiveEditId('');
      setTipoClasificacion('activo_fijo_inversion');
      setNombreInstrumento('');
      setInstitucion('');
      setMoneda('COP');
      setValorMonto('');
      setMontoOriginal('');
      setTasaRendimientoOInteres('');
      setEsLiquidezInmediata(false);
      return;
    }
    setActiveEditId(item.id);
    setTipoClasificacion(item.tipoClasificacion);
    setNombreInstrumento(item.name);
    setInstitucion(item.type);
    setMoneda(item.currency === 'USD' ? 'USD' : 'COP');
    setValorMonto(String(item.amount));
    setMontoOriginal(
      item.originalAmount !== undefined && item.originalAmount !== null
        ? String(item.originalAmount)
        : ''
    );
    setTasaRendimientoOInteres(
      item.interestRate !== undefined && item.interestRate !== null ? String(item.interestRate) : ''
    );
    setEsLiquidezInmediata(false);
  };

  useEffect(() => {
    if (isOpen) {
      setSuccessPayload(null);
      setErrors({});
      setConfirmDelete(false);
      loadItemIntoForm(editingItem || null);
    }
  }, [isOpen, editingItem]);

  if (!isOpen) return null;

  const isEditing = Boolean(activeEditId);
  const allExistingItems: EditablePatrimonyItem[] = [...existingAssets, ...existingLiabilities];

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!nombreInstrumento.trim() || nombreInstrumento.trim().length < 2) {
      newErrors.nombreInstrumento =
        'El nombre del activo o deuda debe tener al menos 2 caracteres.';
    }

    if (!institucion.trim()) {
      newErrors.institucion =
        'Indica el tipo o entidad (ej. Inmueble, Vehículo, Crédito hipotecario).';
    }

    const val = parseFloat(valorMonto);
    if (valorMonto === '' || isNaN(val) || (isEditing ? val < 0 : val <= 0)) {
      newErrors.valorMonto = isEditing
        ? 'El valor o saldo actual debe ser mayor o igual a 0.'
        : 'El valor o saldo adeudado debe ser mayor a 0.';
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

    const parsedOriginal =
      tipoClasificacion === 'pasivo_deuda' && montoOriginal !== '' && !isNaN(parseFloat(montoOriginal))
        ? parseFloat(montoOriginal)
        : undefined;

    const payload: AssetLiabilityPayload = {
      id: isEditing ? activeEditId : undefined,
      tipoClasificacion,
      nombreInstrumento: nombreInstrumento.trim(),
      institucion: institucion.trim(),
      moneda,
      valorMonto: parseFloat(valorMonto),
      montoOriginal: parsedOriginal,
      tasaRendimientoOInteres: tasaRendimientoOInteres
        ? parseFloat(tasaRendimientoOInteres)
        : undefined,
      fechaValoracion,
      esLiquidezInmediata,
      notasAclaratorias: notasAclaratorias.trim() || undefined,
    };

    try {
      const headers = await buildAuthHeaders();
      const endpoint = isEditing ? `/api/patrimony/${activeEditId}` : '/api/patrimony';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
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

  const handleDelete = async () => {
    if (!activeEditId) return;
    setIsLoading(true);
    setErrors({});
    try {
      const headers = await buildAuthHeaders();
      const response = await fetch(
        `/api/patrimony/${activeEditId}?tipoClasificacion=${encodeURIComponent(tipoClasificacion)}`,
        {
          method: 'DELETE',
          headers,
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo eliminar el registro patrimonial.');
      }
      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
      onClose();
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Error al eliminar registro en Neon DB.',
      });
    } finally {
      setIsLoading(false);
      setConfirmDelete(false);
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
                {isEditing
                  ? 'Editar Activo o Pasivo Existente'
                  : 'Gestionar Activo, Inversión o Pasivo'}
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
                <span className={styles.statusCyan}>
                  {isEditing ? 'Status: 200 Updated' : 'Status: 201 Created'}
                </span>
              </div>
              <pre className={styles.payloadPre}>{JSON.stringify(successPayload, null, 2)}</pre>
            </div>

            <div className={styles.successActions}>
              <button
                type="button"
                onClick={() => {
                  setSuccessPayload(null);
                  loadItemIntoForm(null);
                }}
                className={styles.secondaryActionBtn}
              >
                Gestionar Otro
              </button>
              <button type="button" onClick={onClose} className={styles.doneBtnCyan}>
                Cerrar y Ver Balance
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            {/* Selector rápido para editar activo/pasivo existente o crear uno nuevo */}
            {allExistingItems.length > 0 && (
              <div>
                <label htmlFor="al-select-existing" className={styles.label}>
                  Acción / Registro a Gestionar
                </label>
                <select
                  id="al-select-existing"
                  value={activeEditId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    if (!selectedId) {
                      loadItemIntoForm(null);
                      return;
                    }
                    const found = allExistingItems.find((it) => it.id === selectedId) || null;
                    loadItemIntoForm(found);
                  }}
                  className={styles.inputCyan}
                >
                  <option value="">+ Crear Nuevo Activo o Pasivo</option>
                  {existingAssets.length > 0 && (
                    <optgroup label="Activos Fijos / Inversiones Existentes">
                      {existingAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          ✎ Activo: {asset.name} ({asset.type} ·{' '}
                          {asset.currency === 'USD'
                            ? `US$ ${asset.amount.toLocaleString('en-US')}`
                            : `$ ${asset.amount.toLocaleString('es-CO')} COP`}
                          )
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {existingLiabilities.length > 0 && (
                    <optgroup label="Pasivos / Deudas Existentes">
                      {existingLiabilities.map((lia) => (
                        <option key={lia.id} value={lia.id}>
                          ✎ Pasivo: {lia.name} ({lia.type} ·{' '}
                          {lia.currency === 'USD'
                            ? `US$ ${lia.amount.toLocaleString('en-US')}`
                            : `$ ${lia.amount.toLocaleString('es-CO')} COP`}
                          )
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            {/* Clasificación Patrimonial */}
            <div>
              <label className={styles.labelSpaced}>Clasificación Contable</label>
              <div className={styles.segmentedGrid}>
                {!isEditing && (
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
                )}
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => {
                    if (isEditing) return;
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
                  disabled={isEditing}
                  onClick={() => {
                    if (isEditing) return;
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

            {/* Nombre y Tipo / Entidad */}
            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="al-nombre" className={styles.label}>
                  Nombre del Activo / Pasivo <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="al-nombre"
                  type="text"
                  placeholder="ej. Macerata, Meridiano, BYD, Larimar"
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
                  Tipo / Entidad <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="al-entidad"
                  type="text"
                  placeholder="ej. Inmueble, Vehículo, Crédito hipotecario"
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

            {/* Valor Actual y Moneda */}
            <div className={styles.gridAmountRow}>
              <div className={styles.colSpan2}>
                <label htmlFor="al-valor" className={styles.label}>
                  {tipoClasificacion === 'pasivo_deuda'
                    ? 'Saldo Actual de la Deuda'
                    : 'Valor Estimado Actual'}{' '}
                  <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="al-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="ej. 400000000"
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

            {/* Si es Pasivo, permitir actualizar también Monto Original del Crédito */}
            {tipoClasificacion === 'pasivo_deuda' && (
              <div>
                <label htmlFor="al-monto-original" className={styles.label}>
                  Monto Original del Crédito (Opcional)
                </label>
                <input
                  id="al-monto-original"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="ej. 250000000"
                  value={montoOriginal}
                  onChange={(e) => setMontoOriginal(e.target.value)}
                  className={styles.inputMonoCyan}
                />
              </div>
            )}

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

            {tipoClasificacion === 'activo_liquido' && !isEditing && (
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
              {isEditing ? (
                confirmDelete ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isLoading}
                      className={styles.cancelBtn}
                      style={{ color: '#fda4af', borderColor: 'rgba(244, 63, 94, 0.45)' }}
                    >
                      Confirmar Eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={isLoading}
                      className={styles.cancelBtn}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={isLoading}
                    className={styles.cancelBtn}
                    style={{ color: '#fda4af', borderColor: 'rgba(244, 63, 94, 0.35)' }}
                  >
                    Eliminar Registro
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className={styles.cancelBtn}
                >
                  Cancelar
                </button>
              )}

              <button type="submit" disabled={isLoading} className={styles.submitBtnCyan}>
                {isLoading ? (
                  <>
                    <Loader2 className={styles.spinnerIcon} />
                    <span>Actualizando Balance...</span>
                  </>
                ) : (
                  <>
                    <span>{isEditing ? 'Guardar Cambios' : 'Guardar Registro'}</span>
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
  initialPeriod?: string;
  initialSavingsGoal?: number;
  availableMonths?: string[];
  onSubmitSuccess?: (payload: PeriodConfigPayload) => void;
}

export const PeriodConfigFormModal: React.FC<PeriodConfigFormProps> = ({
  isOpen,
  onClose,
  initialTrm = 3303.16,
  initialPeriod = 'ALL',
  initialSavingsGoal = 20,
  availableMonths = [],
  onSubmitSuccess,
}) => {
  const queryClient = useQueryClient();
  const [modoPeriodo, setModoPeriodo] = useState<'ALL' | 'MONTH'>(
    initialPeriod === 'ALL' ? 'ALL' : 'MONTH'
  );
  const [periodoMesAno, setPeriodoMesAno] = useState<string>(
    initialPeriod && initialPeriod !== 'ALL'
      ? initialPeriod
      : availableMonths[availableMonths.length - 1] || '2026-10'
  );
  const [trmOficialCopUsd, setTrmOficialCopUsd] = useState<string>(String(initialTrm));
  const [tasaAhorroMetaPorcentaje, setTasaAhorroMetaPorcentaje] = useState<string>(
    String(initialSavingsGoal)
  );
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

  useEffect(() => {
    if (isOpen) {
      setSuccessPayload(null);
      setErrors({});
      setModoPeriodo(initialPeriod === 'ALL' ? 'ALL' : 'MONTH');
      if (initialPeriod && initialPeriod !== 'ALL') {
        setPeriodoMesAno(initialPeriod);
      } else if (availableMonths.length > 0 && !periodoMesAno) {
        setPeriodoMesAno(availableMonths[availableMonths.length - 1]);
      }
    }
  }, [isOpen, initialPeriod]);

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

    const effectivePeriod = modoPeriodo === 'ALL' ? 'ALL' : periodoMesAno;

    const payload: PeriodConfigPayload = {
      periodoMesAno: effectivePeriod,
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

  const handleClose = () => {
    setSuccessPayload(null);
    setErrors({});
    onClose();
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
                Filtra el Dashboard por mes o acumulado anual y ajusta la TRM
              </p>
            </div>
          </div>
          <button onClick={handleClose} aria-label="Cerrar modal" className={styles.closeBtn}>
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
                  El Dashboard ahora muestra el período{' '}
                  <strong>
                    {successPayload.periodoMesAno === 'ALL'
                      ? 'Todo el Año (Acumulado)'
                      : successPayload.periodoMesAno}
                  </strong>{' '}
                  y se actualizó la TRM (${successPayload.trmOficialCopUsd} COP) en Neon DB.
                </p>
              </div>
            </div>

            <div className={styles.payloadBox}>
              <div className={styles.payloadHeader}>
                <span className={styles.payloadLabelPurple}>
                  <Code2 className={styles.smallIcon} /> Payload Aplicado
                </span>
                <span className={styles.statusPurple}>Status: 200 OK</span>
              </div>
              <pre className={styles.payloadPre}>{JSON.stringify(successPayload, null, 2)}</pre>
            </div>

            <div className={styles.successActions}>
              <button
                type="button"
                onClick={() => setSuccessPayload(null)}
                className={styles.secondaryActionBtn}
              >
                Cambiar Otro Período
              </button>
              <button type="button" onClick={handleClose} className={styles.doneBtnPurple}>
                Aplicar y Ver Dashboard
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            <div>
              <label className={styles.labelSpaced}>Alcance del Período en el Dashboard</label>
              <div className={styles.gridTwoCols}>
                <button
                  type="button"
                  onClick={() => setModoPeriodo('ALL')}
                  className={`${styles.segBtn} ${
                    modoPeriodo === 'ALL' ? styles.segBtnActivePurple : ''
                  }`}
                >
                  Todo el Año (Acumulado 2026)
                </button>
                <button
                  type="button"
                  onClick={() => setModoPeriodo('MONTH')}
                  className={`${styles.segBtn} ${
                    modoPeriodo === 'MONTH' ? styles.segBtnActivePurple : ''
                  }`}
                >
                  Filtrar un Mes Específico
                </button>
              </div>
            </div>

            <div className={styles.gridTwoCols}>
              <div>
                <label htmlFor="cfg-periodo" className={styles.label}>
                  {modoPeriodo === 'ALL' ? 'Período Seleccionado' : 'Mes / Período a Consultar'}
                </label>
                {modoPeriodo === 'ALL' ? (
                  <input
                    id="cfg-periodo"
                    type="text"
                    disabled
                    value="Todo el Año (2026)"
                    className={styles.inputMonoPurple}
                  />
                ) : (
                  <input
                    id="cfg-periodo"
                    type="month"
                    value={periodoMesAno}
                    onChange={(e) => setPeriodoMesAno(e.target.value)}
                    className={styles.inputMonoPurple}
                  />
                )}
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
                onClick={handleClose}
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

  useEffect(() => {
    if (isOpen) {
      setSuccessPayload(null);
      setErrors({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isCreditCard = type === 'Tarjeta de crédito';

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Ingresa un nombre de cuenta válido (mínimo 2 caracteres).';
    }

    const numericBalance = parseFloat(initialBalance);
    if (initialBalance === '' || isNaN(numericBalance) || (!isCreditCard && numericBalance < 0)) {
      newErrors.initialBalance = isCreditCard
        ? 'Ingresa la deuda actual de la tarjeta (0 si está al día).'
        : 'El saldo inicial / actual debe ser un número mayor o igual a 0.';
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

    const rawBalance = parseFloat(initialBalance);
    const numericBalance = isCreditCard
      ? rawBalance === 0
        ? 0
        : -Math.abs(rawBalance)
      : rawBalance;

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
                Crear Nueva Cuenta / Billetera / TC
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
                  movimientos en el Canvas.
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
                  placeholder={
                    isCreditCard
                      ? 'ej. TC Nu, TC Bancolombia'
                      : 'ej. Cuenta Nu COP, Billetera Nequi, Efectivo'
                  }
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
                  <option value="Tarjeta de crédito">Tarjeta de Crédito (Cupo / Deuda)</option>
                  <option value="Broker">Broker Internacional / Acciones</option>
                  <option value="Inversión">Fondo de Inversión</option>
                </select>
              </div>
            </div>

            <div className={styles.gridAmountRow}>
              <div className={styles.colSpan2}>
                <label htmlFor="acc-balance" className={styles.label}>
                  {isCreditCard
                    ? 'Deuda Actual en la Tarjeta (0 si está al día)'
                    : 'Saldo Inicial / Valor Actual'}{' '}
                  <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="acc-balance"
                  type="number"
                  step="0.01"
                  min={isCreditCard ? undefined : '0'}
                  placeholder={isCreditCard ? 'ej. 0 (se registra en negativo si debes)' : 'ej. 1000000'}
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

/* =========================================================================
   FORMULARIO 5: LOTE DE COMPRA DE ACCIONES / ETFs (PORTFOLIO HOLDINGS)
   ========================================================================= */

export interface EditableStockHolding {
  id: string;
  account_id: string;
  ticker: string;
  security_name: string;
  shares: string;
  average_buy_price: string;
  purchase_date?: string;
  currency: string;
}

interface StockHoldingFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingHolding?: EditableStockHolding | null;
}

export const StockHoldingFormModal: React.FC<StockHoldingFormProps> = ({
  isOpen,
  onClose,
  editingHolding = null,
}) => {
  const queryClient = useQueryClient();
  const isEditMode = Boolean(editingHolding?.id);

  const [ticker, setTicker] = useState<string>('');
  const [securityName, setSecurityName] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [investedAmount, setInvestedAmount] = useState<string>('');
  const [shares, setShares] = useState<string>('');
  const [buyPrice, setBuyPrice] = useState<string>('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});

    if (editingHolding) {
      const sh = Number(editingHolding.shares || 0);
      const bp = Number(editingHolding.average_buy_price || 0);
      setTicker(editingHolding.ticker || '');
      setSecurityName(editingHolding.security_name || '');
      setPurchaseDate(
        editingHolding.purchase_date
          ? editingHolding.purchase_date.slice(0, 10)
          : new Date().toISOString().split('T')[0]
      );
      setShares(String(sh));
      setBuyPrice(String(bp));
      setInvestedAmount(sh > 0 && bp > 0 ? (sh * bp).toFixed(2) : '');
      setCurrency((editingHolding.currency as CurrencyCode) || 'USD');
    } else {
      setTicker('');
      setSecurityName('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setInvestedAmount('');
      setShares('');
      setBuyPrice('');
      setCurrency('USD');
    }
  }, [isOpen, editingHolding]);

  if (!isOpen) return null;

  const numShares = parseFloat(shares);
  const numBuyPrice = parseFloat(buyPrice);
  const calculatedTotal =
    Number.isFinite(numShares) && numShares > 0 && Number.isFinite(numBuyPrice) && numBuyPrice > 0
      ? numShares * numBuyPrice
      : 0;

  const handleInvestedAmountChange = (val: string) => {
    setInvestedAmount(val);
    const amt = parseFloat(val);
    const bp = parseFloat(buyPrice);
    if (Number.isFinite(amt) && amt > 0 && Number.isFinite(bp) && bp > 0) {
      setShares((amt / bp).toFixed(8));
      if (errors.shares) setErrors((prev) => ({ ...prev, shares: '' }));
    }
  };

  const handleBuyPriceChange = (val: string) => {
    setBuyPrice(val);
    if (errors.buyPrice) setErrors((prev) => ({ ...prev, buyPrice: '' }));
    const bp = parseFloat(val);
    const amt = parseFloat(investedAmount);
    if (Number.isFinite(amt) && amt > 0 && Number.isFinite(bp) && bp > 0) {
      setShares((amt / bp).toFixed(8));
      if (errors.shares) setErrors((prev) => ({ ...prev, shares: '' }));
    }
  };

  const handleSharesChange = (val: string) => {
    setShares(val);
    if (errors.shares) setErrors((prev) => ({ ...prev, shares: '' }));
    const sh = parseFloat(val);
    const bp = parseFloat(buyPrice);
    if (Number.isFinite(sh) && sh > 0 && Number.isFinite(bp) && bp > 0) {
      setInvestedAmount((sh * bp).toFixed(2));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!ticker.trim()) {
      newErrors.ticker = 'Ingresa el símbolo (ticker) de la acción o ETF (ej. AAPL, SPY, MU).';
    }
    if (!purchaseDate) {
      newErrors.purchaseDate = 'La fecha de compra es obligatoria.';
    }
    if (!shares || isNaN(numShares) || numShares <= 0) {
      newErrors.shares = 'Ingresa el monto invertido o la cantidad de acciones (> 0).';
    }
    if (!buyPrice || isNaN(numBuyPrice) || numBuyPrice <= 0) {
      newErrors.buyPrice = 'Ingresa un precio de compra unitario mayor a 0.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const headers = await buildAuthHeaders();
      const endpoint =
        isEditMode && editingHolding?.id
          ? `/api/investments/${encodeURIComponent(editingHolding.id)}`
          : '/api/investments/buy';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          name: securityName.trim() || undefined,
          purchaseDate,
          shares: numShares,
          buyPrice: numBuyPrice,
          currency,
          deductFromAccount: false,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo guardar el lote de acciones.');
      }

      await queryClient.invalidateQueries({ queryKey: ['canvas-dashboard'] });
      onClose();
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Error al guardar lote en Neon DB.',
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
        aria-labelledby="stock-form-title"
        className={styles.modalCard}
      >
        <div className={styles.topGlowCyan} />

        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBoxCyan}>
              <TrendingUp className={styles.headerIcon} />
            </div>
            <div>
              <h2 id="stock-form-title" className={styles.modalTitle}>
                {isEditMode
                  ? 'Editar Lote de Compra de Acción / ETF'
                  : 'Registrar Compra de Acción / ETF'}
              </h2>
              <p className={styles.modalSubtitle}>
                Ingresa el Monto Invertido y el Precio de la Acción (calcula las Shares automáticamente)
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar modal" className={styles.closeBtn}>
            <X className={styles.closeIcon} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <div className={styles.gridTwoCols}>
            <div>
              <label htmlFor="stock-ticker" className={styles.label}>
                Ticker / Símbolo <span className={styles.requiredStar}>*</span>
              </label>
              <input
                id="stock-ticker"
                type="text"
                placeholder="ej. AAPL, SPY, MU, VOO"
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value.toUpperCase());
                  if (errors.ticker) setErrors((prev) => ({ ...prev, ticker: '' }));
                }}
                aria-invalid={!!errors.ticker}
                className={styles.inputMonoCyan}
              />
              {errors.ticker && (
                <p className={styles.errorText}>
                  <AlertCircle className={styles.errorIcon} /> {errors.ticker}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="stock-date" className={styles.label}>
                Fecha de Compra <span className={styles.requiredStar}>*</span>
              </label>
              <input
                id="stock-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => {
                  setPurchaseDate(e.target.value);
                  if (errors.purchaseDate) setErrors((prev) => ({ ...prev, purchaseDate: '' }));
                }}
                className={styles.inputMonoCyan}
              />
              {errors.purchaseDate && (
                <p className={styles.errorText}>
                  <AlertCircle className={styles.errorIcon} /> {errors.purchaseDate}
                </p>
              )}
            </div>
          </div>

          <div className={styles.gridTwoCols}>
            <div>
              <label htmlFor="stock-invested-amount" className={styles.label}>
                Monto Invertido ({currency}) <span className={styles.requiredStar}>*</span>
              </label>
              <input
                id="stock-invested-amount"
                type="number"
                step="any"
                min="0"
                placeholder="ej. 500.00"
                value={investedAmount}
                onChange={(e) => handleInvestedAmountChange(e.target.value)}
                className={styles.inputMonoCyan}
              />
            </div>

            <div>
              <label htmlFor="stock-buy-price" className={styles.label}>
                Precio de la Acción en la Compra <span className={styles.requiredStar}>*</span>
              </label>
              <input
                id="stock-buy-price"
                type="number"
                step="any"
                min="0"
                placeholder="ej. 328.07"
                value={buyPrice}
                onChange={(e) => handleBuyPriceChange(e.target.value)}
                aria-invalid={!!errors.buyPrice}
                className={styles.inputMonoCyan}
              />
              {errors.buyPrice && (
                <p className={styles.errorText}>
                  <AlertCircle className={styles.errorIcon} /> {errors.buyPrice}
                </p>
              )}
            </div>
          </div>

          <div className={styles.gridTwoCols}>
            <div>
              <label htmlFor="stock-shares" className={styles.label}>
                Cantidad de Acciones (Shares calculadas) <span className={styles.requiredStar}>*</span>
              </label>
              <input
                id="stock-shares"
                type="number"
                step="any"
                min="0"
                placeholder="Se calcula solo (Monto / Precio)"
                value={shares}
                onChange={(e) => handleSharesChange(e.target.value)}
                aria-invalid={!!errors.shares}
                className={styles.inputMonoCyan}
              />
              {errors.shares && (
                <p className={styles.errorText}>
                  <AlertCircle className={styles.errorIcon} /> {errors.shares}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="stock-currency" className={styles.label}>
                Moneda de Cotización
              </label>
              <select
                id="stock-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className={styles.inputMonoCyan}
              >
                <option value="USD">USD (US$)</option>
                <option value="COP">COP ($)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="stock-name" className={styles.label}>
              Nombre de la Empresa / ETF (Opcional · se autocompleta con Yahoo Finance)
            </label>
            <input
              id="stock-name"
              type="text"
              placeholder="ej. Apple Inc., SPDR S&P 500 ETF Trust, Micron Technology"
              value={securityName}
              onChange={(e) => setSecurityName(e.target.value)}
              className={styles.inputCyan}
            />
          </div>

          {calculatedTotal > 0 && (
            <div className={styles.conversionBanner}>
              <span>
                Resumen del Lote ({Number(shares).toFixed(6)} shares × {buyPrice}):
              </span>
              <span className={styles.conversionAmount}>
                {currency === 'USD' ? 'US$' : '$'}
                {calculatedTotal.toLocaleString('es-CO', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                {currency}
              </span>
            </div>
          )}

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

            <button type="submit" disabled={isLoading} className={styles.submitBtnCyan}>
              {isLoading ? (
                <>
                  <Loader2 className={styles.spinnerIcon} />
                  <span>{isEditMode ? 'Actualizando Lote...' : 'Guardando Lote...'}</span>
                </>
              ) : (
                <>
                  <span>{isEditMode ? 'Guardar Cambios' : 'Registrar Lote'}</span>
                  <ArrowRight className={styles.arrowIcon} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

