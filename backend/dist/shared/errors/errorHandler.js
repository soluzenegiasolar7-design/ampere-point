"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const AppError_1 = require("./AppError");
function errorHandler(err, _req, res, _next) {
    if (err instanceof AppError_1.AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({ error: 'Dados inválidos', details: err.issues });
    }
    console.error(err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
}
