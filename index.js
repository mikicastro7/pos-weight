const { SerialPort } = require('serialport');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Configuración de logging
const isDevelopment = process.env.NODE_ENV !== 'production';

// Función de logging condicional
const log = {
    info: (...args) => isDevelopment && console.log(...args),
    error: (...args) => console.error(...args), // Errores siempre se muestran
    warn: (...args) => isDevelopment && console.warn(...args),
};

// Configuración del servidor Express y Socket.IO
const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Permite conexiones desde cualquier origen (ajustar en producción)
        methods: ["GET", "POST"]
    }
});

// Modo simulación: USE_MOCK_SCALE=true o argumento --mock (opcional --mock=0.5 para peso en kg)
const mockArg = process.argv.find((a) => a === '--mock' || a.startsWith('--mock='));
const USE_MOCK_SCALE =
    process.env.USE_MOCK_SCALE === 'true' ||
    process.env.USE_MOCK_SCALE === '1' ||
    !!mockArg;
const MOCK_WEIGHT_KG = (() => {
    if (mockArg && mockArg.startsWith('--mock=')) {
        const val = parseFloat(mockArg.slice(7));
        if (!Number.isNaN(val)) return val;
    }
    return parseFloat(process.env.MOCK_WEIGHT_KG || '0.2');
})();

const PORT_NAME = process.env.SERIAL_PORT || 'COM9';
const SERVER_PORT = parseInt(process.env.PORT || '3000', 10);

let port = null;
if (!USE_MOCK_SCALE) {
    port = new SerialPort({
        path: PORT_NAME,
        baudRate: 9600,   // igual que la balanza (UF3)
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false,
        rtscts: false,
    });
}

const FRAME_START = 0x02; // STX
const FRAME_END = 0x03;   // ETX

let frameBuffer = '';
let lastWeight = null;

// Variables para estabilización del peso
let currentWeight = null;
let stableWeight = null;
let stabilityTimer = null;
const STABILITY_DELAY = 5; // 0.3 segundos en milisegundos

// Simulador de balanza: emite tramas con el peso configurado (formato UF3: STX + "A   0.200" + ETX)
function startMockScale() {
    log.info(`⚖️  Modo SIMULACIÓN: balanza virtual con peso fijo ${MOCK_WEIGHT_KG} kg (${MOCK_WEIGHT_KG * 1000}g)`);
    const weightStr = MOCK_WEIGHT_KG.toFixed(3).padStart(7); // "  0.200"
    const frame = `A${weightStr}`; // "A  0.200"

    const sendMockFrame = () => {
        // Simulamos el mismo flujo que el puerto serie: STX + contenido + ETX
        for (const byte of [FRAME_START, ...Buffer.from(frame, 'ascii'), FRAME_END]) {
            if (byte === FRAME_START) {
                frameBuffer = '';
            } else if (byte === FRAME_END) {
                const rawFrame = frameBuffer.replace(/\r|\n/g, '').trim();
                if (rawFrame.length > 0) processFrame(rawFrame);
                frameBuffer = '';
            } else {
                frameBuffer += String.fromCharCode(byte);
            }
        }
    };

    sendMockFrame();
    const interval = setInterval(sendMockFrame, 500); // cada 500 ms
    return () => clearInterval(interval);
}

if (port) {
    port.on('open', () => {
        log.info(`✅ Puerto serie abierto en ${PORT_NAME}`);
        log.info('Leyendo tramas de la balanza...\n');
    });

    port.on('error', (err) => {
        log.error('❌ Error en el puerto serie:', err.message);
    });

    port.on('data', (data) => {
        // data es un Buffer, recorremos byte a byte
        for (const byte of data) {
            if (byte === FRAME_START) {
                // Nueva trama: vaciamos el buffer
                frameBuffer = '';
            } else if (byte === FRAME_END) {
                // Fin de trama: procesamos lo que tengamos en frameBuffer
                const rawFrame = frameBuffer.replace(/\r|\n/g, '').trim(); // quitamos \r/\n
                if (rawFrame.length > 0) {
                    processFrame(rawFrame);
                }
                frameBuffer = '';
            } else {
                // Añadimos el carácter al buffer de la trama actual
                frameBuffer += String.fromCharCode(byte);
            }
        }
    });
}

function processFrame(frame) {
    // Ejemplo de frame: "A   0.202"
    // Primera letra = tipo/estado, resto = número

    const match = frame.match(/([-+]?\d+(\.\d+)?)/);
    if (!match) {
        log.warn('⚠️  No se ha encontrado número en la trama.\n');
        return;
    }

    const weight = parseFloat(match[1]);

    // Solo mostramos si cambia el peso, para no spamear
    if (lastWeight === null || weight !== lastWeight) {
        lastWeight = weight;
        log.info('⚖️  Peso leído:', weight, 'kg');
    }

    // Lógica de estabilización
    handleWeightStability(weight);
}

function handleWeightStability(weight) {
    // Si el peso es diferente al actual, reiniciamos el timer
    if (weight !== currentWeight) {
        currentWeight = weight;

        // Cancelamos el timer anterior si existe
        if (stabilityTimer) {
            clearTimeout(stabilityTimer);
        }

        // Iniciamos un nuevo timer de estabilidad
        stabilityTimer = setTimeout(() => {
            // El peso se ha mantenido estable por STABILITY_DELAY ms
            if (weight !== stableWeight) {
                stableWeight = weight;
                log.info('✅ Peso estable:', stableWeight, 'kg');
                log.info('📡 Enviando a clientes WebSocket...\n');

                // Emitir el peso estable a todos los clientes: { weight: number, timestamp?: number }
                io.emit('stableWeight', {
                    weight: stableWeight,
                    timestamp: Date.now()
                });
            }
        }, STABILITY_DELAY);
    }
}

// Abrimos el puerto o arrancamos el simulador
if (USE_MOCK_SCALE) {
    startMockScale();
} else {
    port.open((err) => {
        if (err) {
            return log.error('❌ No se pudo abrir el puerto:', err.message);
        }
    });
}

// Configuración de Socket.IO
io.on('connection', (socket) => {
    log.info('🔌 Cliente WebSocket conectado:', socket.id);
    log.info(`   Total de clientes conectados: ${io.engine.clientsCount}\n`);

    // Enviar el último peso estable al conectarse (si existe)
    if (stableWeight !== null) {
        log.info(`📤 Enviando último peso estable (${stableWeight} kg) al nuevo cliente`);
        socket.emit('stableWeight', {
            weight: stableWeight,
            timestamp: Date.now()
        });
    }

    // Reenviar estado de pantalla cliente: vendedor emite → todos lo reciben (pantalla cliente actualiza UI)
    socket.on('clientScreenState', (payload) => {
        console.log('payload', payload);
        if (payload && typeof payload === 'object') {
            io.emit('clientScreenState', payload);
        }
    });

    socket.on('disconnect', () => {
        log.info('🔌 Cliente WebSocket desconectado:', socket.id);
        log.info(`   Total de clientes conectados: ${io.engine.clientsCount}\n`);
    });
});

// Iniciar servidor HTTP/WebSocket
httpServer.listen(SERVER_PORT, () => {
    log.info('═══════════════════════════════════════════════════');
    log.info('🚀 Servidor de Peso Iniciado');
    log.info('═══════════════════════════════════════════════════');
    log.info(`📡 WebSocket en: ws://localhost:${SERVER_PORT}`);
    log.info(`🌐 HTTP en: http://localhost:${SERVER_PORT}`);
    if (USE_MOCK_SCALE) {
        log.info(`⚖️  Balanza: SIMULADA (${MOCK_WEIGHT_KG} kg / ${MOCK_WEIGHT_KG * 1000}g)`);
    } else {
        log.info(`⚖️  Puerto serie: ${PORT_NAME}`);
    }
    log.info(`⏱️  Tiempo de estabilización: ${STABILITY_DELAY}ms`);
    log.info(`🔧 Modo: ${isDevelopment ? 'DESARROLLO' : 'PRODUCCIÓN'}`);
    log.info('═══════════════════════════════════════════════════\n');
});