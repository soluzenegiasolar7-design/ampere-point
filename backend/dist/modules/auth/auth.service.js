"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.getMe = getMe;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const AppError_1 = require("../../shared/errors/AppError");
async function login(email, password) {
    const user = await database_1.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive)
        throw new AppError_1.AppError('Credenciais inválidas', 401);
    const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!valid)
        throw new AppError_1.AppError('Credenciais inválidas', 401);
    const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, env_1.env.JWT_SECRET, { expiresIn: '7d' });
    const { passwordHash: _, ...safe } = user;
    return { token, user: safe };
}
async function getMe(userId) {
    const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new AppError_1.AppError('Usuário não encontrado', 404);
    const { passwordHash: _, ...safe } = user;
    return safe;
}
