"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.getUser = getUser;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../../config/database");
const AppError_1 = require("../../shared/errors/AppError");
async function listUsers(unit) {
    return database_1.prisma.user.findMany({
        where: { isActive: true, ...(unit ? { unit } : {}) },
        select: { id: true, name: true, email: true, role: true, unit: true, phone: true, pis: true, cpf: true, createdAt: true },
        orderBy: { name: 'asc' },
    });
}
async function createUser(data) {
    const exists = await database_1.prisma.user.findUnique({ where: { email: data.email } });
    if (exists)
        throw new AppError_1.AppError('Email já cadastrado', 409);
    const passwordHash = await bcryptjs_1.default.hash(data.password, 10);
    const user = await database_1.prisma.user.create({
        data: { ...data, passwordHash, password: undefined },
        select: { id: true, name: true, email: true, role: true, unit: true, createdAt: true },
    });
    return user;
}
async function updateUser(id, data) {
    const { password, ...rest } = data;
    const update = { ...rest };
    if (password)
        update.passwordHash = await bcryptjs_1.default.hash(password, 10);
    return database_1.prisma.user.update({
        where: { id },
        data: update,
        select: { id: true, name: true, email: true, role: true, unit: true, isActive: true },
    });
}
async function getUser(id) {
    const user = await database_1.prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, unit: true, phone: true, pis: true, isActive: true, createdAt: true },
    });
    if (!user)
        throw new AppError_1.AppError('Funcionário não encontrado', 404);
    return user;
}
