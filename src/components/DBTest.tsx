import React from 'react';
import { useQuery } from '@tanstack/react-query';
import styles from './DBTest.module.css';

interface DBTestProps {
  userId: string;
}

type RowRecord = Record<string, unknown>;

interface DatabaseOverviewResponse {
  tables: Record<string, RowRecord[]>;
  views: Record<string, RowRecord[]>;
}

export const DBTest: React.FC<DBTestProps> = ({ userId }) => {
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<DatabaseOverviewResponse>({
    queryKey: ['db-overview'],
    queryFn: async () => {
      const res = await fetch('/api/db-overview');
      if (!res.ok) {
        throw new Error('No se pudo obtener el resumen de la base de datos.');
      }
      return res.json();
    },
  });

  if (isLoading) {
    return <p className={styles.statusText}>Conectando y leyendo todas las tablas de Neon Postgres...</p>;
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error al conectar con Neon Postgres';
    return <p className={styles.errorText}>Error de conexión: {errorMessage}</p>;
  }

  const tablesEntries = Object.entries(data?.tables || {});
  const viewsEntries = Object.entries(data?.views || {});

  const renderSectionGroup = (title: string, entries: [string, RowRecord[]][]) => (
    <div className={styles.groupBlock}>
      <h3 className={styles.groupTitle}>{title}</h3>
      {entries.map(([name, rows]) => (
        <div key={name} className={styles.tableSection}>
          <h4 className={styles.sectionTitle}>
            <code>{name}</code> ({rows.length} {rows.length === 1 ? 'registro' : 'registros'})
          </h4>
          {rows.length === 0 ? (
            <p className={styles.emptyText}>Sin registros</p>
          ) : (
            <ul className={styles.rowList}>
              {rows.map((row, idx) => (
                <li key={idx} className={styles.rowItem}>
                  {Object.entries(row).map(([col, val]) => (
                    <span key={col} className={styles.fieldPair}>
                      <strong>{col}:</strong> {val === null || val === undefined ? 'null' : String(val)}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>✔ Inspección de Base de Datos (Neon Postgres)</h3>
          <small className={styles.statusText}>UID sesión actual: {userId}</small>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className={styles.refreshBtn}>
          {isFetching ? 'Actualizando...' : 'Recargar datos'}
        </button>
      </div>

      {renderSectionGroup(`Tablas (${tablesEntries.length})`, tablesEntries)}
      {renderSectionGroup(`Vistas Calculadas (${viewsEntries.length})`, viewsEntries)}
    </div>
  );
};