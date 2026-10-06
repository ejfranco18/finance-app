import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from './lib/firebaseClient';
import { Login } from './components/Login';
import { CanvasPreview } from './components/Canvas';
import styles from './App.module.css';

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
      <div className={styles.loadingContainer}>
        Cargando aplicación...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <CanvasPreview onLogout={handleLogout} userId={user.uid} />;
}