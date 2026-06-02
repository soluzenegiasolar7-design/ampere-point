"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../config/database");
const auth_middleware_1 = require("../auth/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.get('/today', (0, auth_middleware_1.requireRole)('ADMIN', 'MANAGER'), async (_req, res, next) => {
    try {
        const dateOnly = new Date();
        dateOnly.setHours(0, 0, 0, 0);
        const days = await database_1.prisma.workDay.findMany({
            where: { date: dateOnly },
            include: { user: { select: { id: true, name: true, unit: true } } },
        });
        res.json(days);
    }
    catch (e) {
        next(e);
    }
});
router.get('/my', async (req, res, next) => {
    try {
        const userId = req.userId;
        const days = await database_1.prisma.workDay.findMany({
            where: { userId },
            orderBy: { date: 'desc' },
            take: 30,
        });
        res.json(days);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
