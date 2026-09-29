import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Servidor Express local corriendo correctamente' });
});

// En desarrollo local escucha en el puerto 4000
if (process.env.NODE_ENV !== 'production') {
  const PORT = 4000;
  app.listen(PORT, () => {
    console.log(`Backend API corriendo en http://localhost:${PORT}`);
  });
}

export default app;