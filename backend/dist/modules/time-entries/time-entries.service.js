"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.punch = punch;
exports.listTodayEntries = listTodayEntries;
exports.listEntriesByDate = listEntriesByDate;
exports.listAllTodayEntries = listAllTodayEntries;
exports.nextPunchType = nextPunchType;
const database_1 = require("../../config/database");
const AppError_1 = require("../../shared/errors/AppError");
const SEQUENCE = ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'];
function todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
}
async function punch(userId, data) {
    const { start, end } = todayRange();
    const todayEntries = await database_1.prisma.timeEntry.findMany({
        where: { userId, timestamp: { gte: start, lte: end } },
        orderBy: { timestamp: 'asc' },
    });
    const nextExpected = SEQUENCE[todayEntries.length];
    if (!nextExpected)
        throw new AppError_1.AppError('Todos os pontos do dia já foram registrados', 400);
    if (data.type !== nextExpected) {
        throw new AppError_1.AppError(`Próximo ponto esperado: ${nextExpected.replace('_', ' ')}`, 400);
    }
    const { photoData, ...rest } = data;
    const entry = await database_1.prisma.timeEntry.create({ data: { userId, ...rest } });
    // Atualiza status do WorkDay
    const dateOnly = new Date();
    dateOnly.setHours(0, 0, 0, 0);
    await database_1.prisma.workDay.upsert({
        where: { userId_date: { userId, date: dateOnly } },
        update: { status: data.type === 'SAIDA' ? 'FORA' : 'EM_SERVICO' },
        create: { userId, date: dateOnly, status: 'EM_SERVICO' },
    });
    return entry;
}
async function listTodayEntries(userId) {
    const { start, end } = todayRange();
    return database_1.prisma.timeEntry.findMany({
        where: { userId, timestamp: { gte: start, lte: end } },
        orderBy: { timestamp: 'asc' },
    });
}
async function listEntriesByDate(userId, date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return database_1.prisma.timeEntry.findMany({
        where: { userId, timestamp: { gte: d, lte: end } },
        orderBy: { timestamp: 'asc' },
        include: { user: { select: { name: true, unit: true } } },
    });
}
async function listAllTodayEntries() {
    const { start, end } = todayRange();
    return database_1.prisma.timeEntry.findMany({
        where: { timestamp: { gte: start, lte: end } },
        orderBy: { timestamp: 'desc' },
        include: { user: { select: { id: true, name: true, unit: true } } },
    });
}
async function nextPunchType(userId) {
    const { start, end } = todayRange();
    const count = await database_1.prisma.timeEntry.count({
        where: { userId, timestamp: { gte: start, lte: end } },
    });
    return SEQUENCE[count] ?? null;
}
