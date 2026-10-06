// Tu UID real obtenido en la pantalla de prueba
const USER_ID = "3x2MF8k8fneASdMnlP0iJaast132";
const API_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("🚀 Iniciando prueba de endpoints API...\n");

  // 1. Datos de una transacción de prueba (Gasto en Mercado)
  const newTransaction = {
    userId: USER_ID,
    transaction: {
      date: "2026-09-29",
      amount: 100000,
      currency: "COP",
      category: "GASTO",
      categoryName: "Alimentación",
      subCategory: "Mercado",
      accountId: "49964d43-9258-486b-a199-291a9fc36393", // UUID real de Cuenta Nu COP en Neon
      description: "Prueba de API - Mercado semanal",
    }
  };

  try {
    // 2. Enviar POST /api/transactions
    console.log("1. Enviando nueva transacción a la API...");
    const response = await fetch(`${API_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTransaction)
    });

    const data: any = await response.json();
    console.log("Respuesta del Backend:", data);

    if (response.ok && data.success) {
      console.log("\n✅ Transacción registrada con éxito ID:", data.transactionId);
      console.log("Verifica en tu navegador o en Firebase Console:");
      console.log(` - Se debieron restar $85,000 de la cuenta 'acc_nu'.`);
      console.log(` - Se debió crear/actualizar el documento 'monthly_summaries/2026-09'.`);
    } else {
      console.error("\n❌ Error en la API:", data);
    }

  } catch (error) {
    console.error("\n❌ Error de conexión con el Backend:", error);
  }
}

runTests();