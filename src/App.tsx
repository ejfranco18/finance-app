import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/firebaseClient.js';
import { Login } from './components/Login.tsx';
import { DBTest } from './components/DBTest.tsx';


export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Escucha el cambio de estado de sesión
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    queryClient.clear();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        Cargando aplicación...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Navbar de Usuario */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1rem',
        borderBottom: '1px solid #eee',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Finance App</h2>
          <span style={{ fontSize: '0.875rem', color: '#666' }}>
            Sesión iniciada como: <strong>{user.displayName || user.email}</strong>
          </span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            backgroundColor: '#f9f9f9',
            cursor: 'pointer'
          }}
        >
          Cerrar sesión
        </button>
      </header>

      {/* Contenido Principal */}
      <main>
        <DBTest userId={user.uid} />
      </main>
    </div>
  );
}