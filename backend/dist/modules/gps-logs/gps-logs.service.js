"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLog = createLog;
exports.getTodayTrail = getTodayTrail;
const database_1 = require("../../config/database");
const haversine_1 = require("../../shared/utils/haversine");
async function createLog(userId, data) {
    const log = await database_1.prisma.gpsLog.create({ data: { userId, ...data } });
    // Recalcula KM do dia
    const dateOnly = new Date();
    dateOnly.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const logs = await database_1.prisma.gpsLog.findMany({
        where: { userId, timestamp: { gte: dateOnly, lte: end } },
        orderBy: { timestamp: 'asc' },
        select: { latitude: true, longitude: true },
    });
    let totalKm = 0;
    for (let i = 1; i < logs.length; i++) {
        totalKm += (0, haversine_1.haversineKm)(logs[i - 1].latitude, logs[i - 1].longitude, logs[i].latitude, logs[i].longitude);
    }
    await database_1.prisma.workDay.upsert({
        where: { userId_date: { userId, date: dateOnly } },
        update: { totalKm: parseFloat(totalKm.toFixed(2)) },
        create: { userId, date: dateOnly, totalKm: parseFloat(totalKm.toFixed(2)) },
    });
    return log;
}
async function getTodayTrail(userId) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return database_1.prisma.gpsLog.findMany({
        where: { userId, timestamp: { gte: start, lte: end } },
        orderBy: { timestamp: 'asc' },
        select: { latitude: true, longitude: true, timestamp: true, speed: true },
    });
}
