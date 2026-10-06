import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebaseClient';
import styles from './Login.module.css';

export const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      console.error('Error de autenticación con Google');
      setError('No se pudo iniciar sesión con Google. Por favor, inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Luz ambiental de fondo */}
      <div className={styles.ambientGlow} />

      <div className={styles.card}>
        {/* Glow superior de la tarjeta */}
        <div className={styles.topGlow} />

        {/* Icono de la App */}
        <div className={styles.iconWrapper}>
          <svg
            className={styles.appIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
            <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          </svg>
        </div>

        <h1 className={styles.title}>Finance App</h1>
        <p className={styles.subtitle}>
          Gestiona tus cuentas, inversiones y el Canvas financiero en un solo lugar.
        </p>

        {error && (
          <div role="alert" className={styles.errorAlert}>
            {error}
          </div>
        )}

        {/* Botón Continuar con Google */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className={styles.googleButton}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.86c2.26-2.09 3.68-5.17 3.68-9.09z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.26 21.3 7.37 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.27C.46 8.24 0 10.06 0 12s.46 3.76 1.27 5.38l4-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.27 6.62l4 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
            />
          </svg>
          <span className={styles.googleButtonText}>
            {isLoading ? 'Iniciando sesión...' : 'Continuar con Google'}
          </span>
        </button>

        {/* Footer de seguridad */}
        <div className={styles.footer}>
          <span>● Cifrado de 256 bits · Conexión segura con Calc_Data</span>
        </div>
      </div>
    </div>
  );
};

export default Login;

