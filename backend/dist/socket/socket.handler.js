"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
const socket_auth_1 = require("./middleware/socket.auth");
const gps_handler_1 = require("./handlers/gps.handler");
function initSocket(io) {
    io.use(socket_auth_1.socketAuth);
    io.on('connection', (socket) => {
        console.log(`Socket conectado: ${socket.data.userId} (${socket.data.role})`);
        (0, gps_handler_1.registerGpsHandlers)(io, socket);
        socket.on('disconnect', () => {
            console.log(`Socket desconectado: ${socket.data.userId}`);
        });
    });
}
