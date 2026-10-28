import { z } from 'zod';
export const annotationSchema = z.object({
  id: z.string().min(1).max(100), page: z.number().int().min(1).max(200),
  type: z.enum(['text', 'highlight']),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().min(0.02).max(1), height: z.number().min(0.01).max(1),
  text: z.string().max(5000), fontSize: z.number().min(8).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  manualSize: z.boolean().optional(),
});
export const annotationsSchema = z.array(annotationSchema).max(1000).refine(items => new Set(items.map(i => i.id)).size === items.length, 'Há anotações duplicadas.').refine(items => JSON.stringify(items).length <= 400_000, 'O limite de anotações desta apostila foi atingido.');
export type Annotation = z.infer<typeof annotationSchema>;
