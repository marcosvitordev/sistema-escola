import { z } from 'zod';
export const username = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, 'Use 3 a 50 letras, números, pontos ou traços.');
export const password = z.string().min(10, 'A senha precisa ter ao menos 10 caracteres.').max(128).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'A senha deve ocupar no máximo 72 bytes.');
export const person = z.object({ name: z.string().trim().min(3).max(120), username, password, role: z.enum(['ADMIN', 'TEACHER', 'STUDENT']) });
export const bootstrap = person.extend({ institution: z.string().trim().min(3).max(120), slug: username, token: z.string().min(32) });
export const course = z.object({ name: z.string().trim().min(3).max(120), description: z.string().trim().max(2000).default('') });
export const classroom = z.object({ name: z.string().trim().min(3).max(120), courseId: z.string().min(1), teacherId: z.string().min(1) });
