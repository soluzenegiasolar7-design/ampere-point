"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGpsHandlers = registerGpsHandlers;
const gps_logs_service_1 = require("../../modules/gps-logs/gps-logs.service");
function registerGpsHandlers(io, socket) {
    const userId = socket.data.userId;
    const role = socket.data.role;
    // Gestores entram na sala de rastreamento
    if (role === 'ADMIN' || role === 'MANAGER') {
        socket.join('tracking:room');
    }
    socket.on('gps:update', async (data) => {
        try {
            await (0, gps_logs_service_1.createLog)(userId, data);
            io.to('tracking:room').emit('gps:user_location', { userId, ...data, timestamp: new Date() });
        }
        catch (e) {
            console.error('gps:update error', e);
        }
    });
}
