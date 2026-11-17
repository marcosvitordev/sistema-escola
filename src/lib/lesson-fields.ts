import { z } from 'zod';

export const lessonFields = z.object({
  title: z.string().trim().min(3).max(150),
  module: z.string().trim().min(1).max(100),
  description: z.string().max(3000).default(''),
  scheduledAt: z.union([z.literal(''), z.iso.date()]).optional(),
});

export function lessonDate(value?: string) {
  return value ? new Date(`${value}T12:00:00-05:00`) : null;
}
