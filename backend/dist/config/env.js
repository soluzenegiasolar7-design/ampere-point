"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const schema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().default('3002'),
    DATABASE_URL: zod_1.z.string(),
    JWT_SECRET: zod_1.z.string(),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:5174'),
    UPLOAD_DIR: zod_1.z.string().default('./uploads'),
});
exports.env = schema.parse(process.env);
