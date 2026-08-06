'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';

export async function toggleLeadProcessed(id: number) {
  await sql`update leads set processed = not processed where id = ${id}`;
  revalidatePath('/admin/leads');
}
