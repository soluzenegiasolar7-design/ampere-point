"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../config/env");
const AppError_1 = require("../../shared/errors/AppError");
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
        throw new AppError_1.AppError('Não autorizado', 401);
    const token = header.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        req.userId = payload.userId;
        req.userRole = payload.role;
        next();
    }
    catch {
        throw new AppError_1.AppError('Token inválido', 401);
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        const role = req.userRole;
        if (!roles.includes(role))
            throw new AppError_1.AppError('Acesso negado', 403);
        next();
    };
}
