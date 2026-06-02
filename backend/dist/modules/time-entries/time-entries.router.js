"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const time_entries_service_1 = require("./time-entries.service");
const auth_middleware_1 = require("../auth/auth.middleware");
const multer_1 = __importDefault(require("multer"));
const io_1 = require("../../socket/io");
const database_1 = require("../../config/database");
// foto em memória → salva no banco como bytes
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
const punchSchema = zod_1.z.object({
    type: zod_1.z.enum(['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']),
    latitude: zod_1.z.coerce.number(),
    longitude: zod_1.z.coerce.number(),
    accuracy: zod_1.z.coerce.number().optional(),
    deviceInfo: zod_1.z.string().optional(),
});
router.post('/', upload.single('photo'), async (req, res, next) => {
    try {
        const data = punchSchema.parse(req.body);
        const ipAddress = req.ip;
        const userId = req.userId;
        const entry = await (0, time_entries_service_1.punch)(userId, { ...data, ipAddress });
        // salva foto no banco se enviada
        if (req.file?.buffer) {
            await database_1.prisma.timeEntry.update({
                where: { id: entry.id },
                data: {
                    photoData: req.file.buffer,
                    photoUrl: `/api/time-entries/photo/${entry.id}`,
                },
            });
            entry.photoUrl = `/api/time-entries/photo/${entry.id}`;
        }
        // emite localização imediata para gestores
        const io = (0, io_1.getIo)();
        if (io) {
            io.to('tracking:room').emit('gps:user_location', {
                userId,
                latitude: data.latitude,
                longitude: data.longitude,
                accuracy: data.accuracy,
                timestamp: new Date(),
            });
        }
        res.status(201).json(entry);
    }
    catch (e) {
        next(e);
    }
});
// serve foto direto do banco
router.get('/photo/:id', async (req, res, next) => {
    try {
        const entry = await database_1.prisma.timeEntry.findUnique({
            where: { id: req.params.id },
            select: { photoData: true },
        });
        if (!entry?.photoData) {
            res.status(404).json({ message: 'Foto não encontrada' });
            return;
        }
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.send(entry.photoData);
    }
    catch (e) {
        next(e);
    }
});
router.get('/today', async (req, res, next) => {
    try {
        res.json(await (0, time_entries_service_1.listTodayEntries)(req.userId));
    }
    catch (e) {
        next(e);
    }
});
router.get('/next', async (req, res, next) => {
    try {
        res.json({ next: await (0, time_entries_service_1.nextPunchType)(req.userId) });
    }
    catch (e) {
        next(e);
    }
});
router.get('/all/today', (0, auth_middleware_1.requireRole)('ADMIN', 'MANAGER'), async (_req, res, next) => {
    try {
        res.json(await (0, time_entries_service_1.listAllTodayEntries)());
    }
    catch (e) {
        next(e);
    }
});
router.get('/user/:userId', (0, auth_middleware_1.requireRole)('ADMIN', 'MANAGER'), async (req, res, next) => {
    try {
        const date = String(Array.isArray(req.query.date) ? req.query.date[0] : (req.query.date || ''));
        res.json(await (0, time_entries_service_1.listEntriesByDate)(req.params.userId, date || new Date().toISOString()));
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
