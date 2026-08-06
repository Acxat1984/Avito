'use server';

import { revalidatePath } from 'next/cache';
import { applyImport, cancelImport } from '@/lib/import/apply';

export async function applyImportAction(id: number) {
  const r = await applyImport(id);
  revalidatePath('/admin/imports');
  revalidatePath('/admin/companies');
  if (!r.ok) throw new Error(r.error);
}

export async function cancelImportAction(id: number) {
  const r = await cancelImport(id);
  revalidatePath('/admin/imports');
  if (!r.ok) throw new Error(r.error);
}
