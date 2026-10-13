import { io } from 'socket.io-client';
// Empty = same origin (goes through the Vite dev proxy, like /api does).
// Set VITE_SOCKET_URL only if the backend lives on a different host.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';
const options = {
    path: '/socket.io',
    // Default order: start with HTTP long-polling (always works if /api works),
    // then upgrade to WebSocket when possible.
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
};
// One shared socket for the whole app
export const socket = SOCKET_URL ? io(SOCKET_URL, options) : io(options);
socket.on('connect', () => {
    console.log('Socket connected via', socket.io.engine.transport.name);
    socket.io.engine.on('upgrade', () => {
        console.log('Socket upgraded to', socket.io.engine.transport.name);
    });
});
socket.on('connect_error', err => {
    console.warn('Socket connect_error:', err.message);
});
export const API_URL = import.meta.env.VITE_API_URL || '/api';
