'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  secretsEqual,
} from '@/lib/admin-auth';

export async function loginAdmin(formData: FormData): Promise<never> {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword) redirect('/admin?error=config');

  const submittedPassword = formData.get('password');
  if (
    typeof submittedPassword !== 'string' ||
    !secretsEqual(submittedPassword, configuredPassword)
  ) {
    redirect('/admin?error=password');
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(configuredPassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  });

  redirect('/admin');
}

export async function logoutAdmin(): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  redirect('/admin');
}
