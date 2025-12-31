# Integración con React

## 📦 Instalación en tu proyecto React

```bash
npm install socket.io-client
```

## 🔌 Ejemplo de uso

### Opción 1: Hook personalizado (Recomendado)

```javascript
// hooks/useWeight.js
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export const useWeight = () => {
  const [weight, setWeight] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const socket = io('http://localhost:3000');

    socket.on('connect', () => {
      console.log('✅ Conectado al servidor de peso');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('❌ Desconectado del servidor de peso');
      setIsConnected(false);
    });

    socket.on('stableWeight', (data) => {
      console.log('📦 Peso recibido:', data.weight, 'kg');
      setWeight(data.weight);
      setLastUpdate(new Date(data.timestamp));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { weight, isConnected, lastUpdate };
};
```

### Uso en componente:

```javascript
// components/WeightDisplay.jsx
import { useWeight } from '../hooks/useWeight';

function WeightDisplay() {
  const { weight, isConnected, lastUpdate } = useWeight();

  return (
    <div>
      <h2>Peso en tiempo real</h2>
      
      <div>
        Estado: {isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
      </div>
      
      <div>
        {weight !== null ? (
          <p>Peso: {weight.toFixed(3)} kg</p>
        ) : (
          <p>Esperando datos...</p>
        )}
      </div>
      
      {lastUpdate && (
        <small>
          Última actualización: {lastUpdate.toLocaleTimeString()}
        </small>
      )}
    </div>
  );
}

export default WeightDisplay;
```

---

### Opción 2: Directamente en el componente

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function App() {
  const [weight, setWeight] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:3000');

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    
    socket.on('stableWeight', (data) => {
      setWeight(data.weight);
    });

    return () => socket.disconnect();
  }, []);

  return (
    <div>
      <h1>Peso: {weight ? `${weight} kg` : 'Cargando...'}</h1>
      <p>{connected ? 'Conectado ✅' : 'Desconectado ❌'}</p>
    </div>
  );
}

export default App;
```

---

## 📡 Eventos del WebSocket

### Evento: `stableWeight`

Recibe el peso cuando se ha estabilizado (0.3 segundos constante).

**Datos recibidos:**
```javascript
{
  weight: 1.234,              // número (kg)
  timestamp: "2025-12-08T..." // string (ISO 8601)
}
```

---

## 🔧 Configuración

Si tu servidor está en otro puerto o dominio, cambia la URL:

```javascript
const socket = io('http://tu-servidor:puerto');
```

Para producción, usa variables de entorno:

```javascript
const socket = io(process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:3000');
```

---

## 🎯 Tips

1. **Reconexión automática**: Socket.IO maneja reconexiones automáticamente
2. **Cleanup**: Siempre desconecta en el cleanup del useEffect
3. **Estados**: Mantén estados separados para peso, conexión y timestamp
4. **Logs**: Los console.log del servidor te mostrarán las conexiones

---

## 🚀 Iniciar el servidor

```bash
npm start
```

El servidor estará en: **http://localhost:3000**
