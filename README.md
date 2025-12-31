# Sistema de Peso con WebSockets

Sistema para leer peso de balanza por puerto serie y transmitirlo al frontend mediante WebSockets (Socket.IO).

## 🚀 Características

- ✅ Lectura de peso desde balanza por puerto serie (COM9)
- ✅ Estabilización de peso (espera 0.3 segundos de estabilidad)
- ✅ Transmisión en tiempo real via WebSockets
- ✅ Interfaz web incluida para visualización
- ✅ Servidor Express con Socket.IO

## 📦 Instalación

```bash
npm install
```

## ▶️ Uso

### Iniciar el servidor:

```bash
npm start
```

O directamente:

```bash
node index.js
```

### Acceder a la interfaz web:

Abre tu navegador en: **http://localhost:3000**

## 🔧 Configuración

### Cambiar el puerto serie:
En `index.js`, modifica la línea:
```javascript
const PORT_NAME = 'COM9'; // Cambia a tu puerto
```

### Cambiar el tiempo de estabilización:
En `index.js`, modifica:
```javascript
const STABILITY_DELAY = 300; // 300ms = 0.3 segundos
```

### Cambiar el puerto del servidor:
En `index.js`, modifica:
```javascript
const SERVER_PORT = 3000; // Tu puerto deseado
```

## 📡 API WebSocket

### Eventos que emite el servidor:

#### `stableWeight`
Se emite cuando el peso se ha estabilizado (mantenido constante por 0.3 segundos).

**Datos:**
```javascript
{
  weight: 1.234,              // Peso en kg
  timestamp: "2025-12-08T..."  // Marca de tiempo ISO
}
```

### Ejemplo de uso en frontend:

```javascript
const socket = io('http://localhost:3000');

socket.on('stableWeight', (data) => {
  console.log('Peso estable:', data.weight, 'kg');
  console.log('Timestamp:', data.timestamp);
});
```

## 🌐 Endpoints HTTP

### `GET /`
Devuelve el estado del servidor y los pesos actuales.

**Respuesta:**
```json
{
  "status": "running",
  "message": "Servidor de peso activo",
  "currentWeight": 1.234,
  "stableWeight": 1.234
}
```

## 🎨 Integración con tu frontend

Si ya tienes un frontend (React, Vue, Angular, etc.), instala Socket.IO client:

```bash
npm install socket.io-client
```

**Ejemplo en React:**
```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function App() {
  const [weight, setWeight] = useState(null);
  
  useEffect(() => {
    const socket = io('http://localhost:3000');
    
    socket.on('stableWeight', (data) => {
      setWeight(data.weight);
    });
    
    return () => socket.disconnect();
  }, []);
  
  return <div>Peso: {weight} kg</div>;
}
```

## 🔍 Logs de consola

El servidor muestra:
- ⚖️ Peso leído: Cada cambio de peso detectado
- ✅ Peso estable: Cuando se estabiliza y se envía al frontend
- 🔌 Cliente conectado/desconectado: Cuando un cliente WebSocket se conecta

## 🛠️ Tecnologías

- **Express**: Servidor HTTP
- **Socket.IO**: WebSockets en tiempo real
- **SerialPort**: Comunicación con la balanza
- **CORS**: Para permitir conexiones desde diferentes dominios

## 📝 Notas

- El peso solo se envía al frontend cuando se mantiene estable por 0.3 segundos
- Esto evita oscilaciones y múltiples actualizaciones innecesarias
- Todos los clientes conectados reciben el mismo peso simultáneamente
