"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const users_service_1 = require("./users.service");
const auth_middleware_1 = require("../auth/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.get('/', async (req, res, next) => {
    try {
        const unit = req.query.unit;
        // cast to string if array
        const unitStr = Array.isArray(unit) ? unit[0] : unit;
        res.json(await (0, users_service_1.listUsers)(unitStr));
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        res.json(await (0, users_service_1.getUser)(req.params.id));
    }
    catch (e) {
        next(e);
    }
});
const createSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
    unit: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    cpf: zod_1.z.string().optional(),
    pis: zod_1.z.string().optional(),
});
router.post('/', (0, auth_middleware_1.requireRole)('ADMIN', 'MANAGER'), async (req, res, next) => {
    try {
        const data = createSchema.parse(req.body);
        res.status(201).json(await (0, users_service_1.createUser)(data));
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', (0, auth_middleware_1.requireRole)('ADMIN', 'MANAGER'), async (req, res, next) => {
    try {
        res.json(await (0, users_service_1.updateUser)(req.params.id, req.body));
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
