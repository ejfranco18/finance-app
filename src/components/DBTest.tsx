import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebaseClient.js';

interface DBTestProps {
  userId: string;
}

export const DBTest: React.FC<DBTestProps> = ({ userId }) => {
  // 1. Leer Configuración (settings/default)
  const {
    data: settings = null,
    isLoading: loadingSettings,
    error: settingsError,
  } = useQuery({
    queryKey: ['settings', userId],
    queryFn: async () => {
      const settingsRef = doc(db, `users/${userId}/settings/default`);
      const settingsSnap = await getDoc(settingsRef);
      return settingsSnap.exists() ? settingsSnap.data() : null;
    },
    enabled: Boolean(userId),
  });

  // 2. Leer Cuentas (accounts)
  const {
    data: accounts = [],
    isLoading: loadingAccounts,
    error: accountsError,
  } = useQuery({
    queryKey: ['accounts', userId],
    queryFn: async () => {
      const accountsRef = collection(db, `users/${userId}/accounts`);
      const accountsSnap = await getDocs(accountsRef);
      const accountsList: any[] = [];
      accountsSnap.forEach((docSnap) => {
        accountsList.push({ id: docSnap.id, ...docSnap.data() });
      });
      return accountsList;
    },
    enabled: Boolean(userId),
  });

  const loading = loadingSettings || loadingAccounts;
  const queryError = settingsError || accountsError;

  if (loading) return <p style={{ color: '#666' }}>Conectando y leyendo Firestore...</p>;
  if (queryError) {
    const errorMessage = queryError instanceof Error ? queryError.message : 'Error al conectar con Firestore';
    return <p style={{ color: '#dc2626' }}>Error de conexión: {errorMessage}</p>;
  }

  const expenseCategories = settings?.categories?.GASTO || [];

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '1.5rem',
      marginTop: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: '#0f172a' }}>✔ Conexión e Integridad de Firestore OK</h3>
        <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
          Tasa USD: ${settings?.exchangeRateCOPUSD || 'N/A'} COP
        </span>
      </div>

      {/* Cuentas */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#334155' }}>Cuentas Registradas ({accounts.length}):</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {accounts.map((acc) => (
            <div key={acc.id} style={{ padding: '0.75rem', border: '1px solid #f1f5f9', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{acc.type || 'Cuenta'}</div>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>{acc.name || acc.id}</div>
              <div style={{ color: '#16a34a', fontWeight: 'bold', marginTop: '0.25rem' }}>
                ${acc.balance?.toLocaleString() || 0} {acc.currency || 'COP'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categorías de Gastos */}
      <div>
        <h4 style={{ marginBottom: '0.5rem', color: '#334155' }}>Categorías de Gastos ({expenseCategories.length}):</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto', padding: '0.5rem', border: '1px solid #f1f5f9', borderRadius: '6px' }}>
          {expenseCategories.map((cat: string, index: number) => (
            <span key={index} style={{
              backgroundColor: '#f1f5f9',
              color: '#334155',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.8rem'
            }}>
              {cat}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};