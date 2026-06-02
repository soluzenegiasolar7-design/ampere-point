"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const gps_logs_service_1 = require("./gps-logs.service");
const auth_middleware_1 = require("../auth/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.get('/trail/today', async (req, res, next) => {
    try {
        res.json(await (0, gps_logs_service_1.getTodayTrail)(req.userId));
    }
    catch (e) {
        next(e);
    }
});
router.get('/trail/:userId', (0, auth_middleware_1.requireRole)('ADMIN', 'MANAGER'), async (req, res, next) => {
    try {
        res.json(await (0, gps_logs_service_1.getTodayTrail)(req.params.userId));
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
