"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_service_1 = require("./auth.service");
const auth_middleware_1 = require("./auth.middleware");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const result = await (0, auth_service_1.login)(email, password);
        res.json(result);
    }
    catch (e) {
        next(e);
    }
});
router.get('/me', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = await (0, auth_service_1.getMe)(req.userId);
        res.json(user);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
