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

const PORT_NAME = 'COM9';
const SERVER_PORT = 3000; // Puerto del servidor HTTP/WebSocket

const port = new SerialPort({
    path: PORT_NAME,
    baudRate: 9600,   // igual que la balanza (UF3)
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false,
    rtscts: false,
});

const FRAME_START = 0x02; // STX
const FRAME_END = 0x03;   // ETX

let frameBuffer = '';
let lastWeight = null;

// Variables para estabilización del peso
let currentWeight = null;
let stableWeight = null;
let stabilityTimer = null;
const STABILITY_DELAY = 5; // 0.3 segundos en milisegundos

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

                // Emitir el peso estable a todos los clientes conectados
                io.emit('stableWeight', {
                    weight: stableWeight,
                    timestamp: new Date().toISOString()
                });
            }
        }, STABILITY_DELAY);
    }
}

// Abrimos el puerto
port.open((err) => {
    if (err) {
        return log.error('❌ No se pudo abrir el puerto:', err.message);
    }
});

// Configuración de Socket.IO
io.on('connection', (socket) => {
    log.info('🔌 Cliente WebSocket conectado:', socket.id);
    log.info(`   Total de clientes conectados: ${io.engine.clientsCount}\n`);

    // Enviar el último peso estable al conectarse (si existe)
    if (stableWeight !== null) {
        log.info(`📤 Enviando último peso estable (${stableWeight} kg) al nuevo cliente`);
        socket.emit('stableWeight', {
            weight: stableWeight,
            timestamp: new Date().toISOString()
        });
    }

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
    log.info(`⚖️  Puerto serie: ${PORT_NAME}`);
    log.info(`⏱️  Tiempo de estabilización: ${STABILITY_DELAY}ms`);
    log.info(`🔧 Modo: ${isDevelopment ? 'DESARROLLO' : 'PRODUCCIÓN'}`);
    log.info('═══════════════════════════════════════════════════\n');
});