import { NextResponse, type NextRequest } from 'next/server';
import { getStore } from '@/lib/db/client';
import { DB_UNAVAILABLE, jsonError } from '@/lib/http';
import { isDeviceHash } from '../device-hash';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const deviceHash = request.nextUrl.searchParams.get('deviceHash')?.trim().toLowerCase() ?? '';
  if (!isDeviceHash(deviceHash)) return jsonError(400, 'Некорректный идентификатор устройства');

  try {
    const wish = await getStore().findByDeviceHash(deviceHash);
    if (!wish) return NextResponse.json({ wish: null });

    return NextResponse.json({
      wish: {
        name: wish.name,
        specialty: wish.specialty,
        wish: wish.wish,
        status: wish.status,
        createdAt: wish.createdAt,
      },
    });
  } catch (error) {
    console.error('[GET /api/wishes/mine]', error);
    return jsonError(503, DB_UNAVAILABLE);
  }
}
