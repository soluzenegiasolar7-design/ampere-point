"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    process.exit(1);
});
console.log('Iniciando servidor...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL definida:', !!process.env.DATABASE_URL);
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const socket_handler_1 = require("./socket/socket.handler");
const io_1 = require("./socket/io");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const httpServer = (0, http_1.createServer)(app_1.default);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: true, credentials: true },
});
(0, io_1.setIo)(io);
(0, socket_handler_1.initSocket)(io);
const uploadDir = path_1.default.resolve(env_1.env.UPLOAD_DIR);
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const port = parseInt(process.env.PORT || '3002');
httpServer.listen(port, '0.0.0.0', () => {
    console.log(`AmperePoint backend rodando na porta ${port}`);
});
