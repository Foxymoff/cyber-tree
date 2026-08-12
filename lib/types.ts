export type WishStatus = 'pending' | 'approved' | 'rejected';

export interface Wish {
  id: number;
  name: string;
  specialty: string;      // id из config/specialties.ts
  wish: string;
  status: WishStatus;
  autoFlag: string | null;
  createdAt: string;      // ISO
  updatedAt: string;      // ISO
}

export type PublicWish = Pick<
  Wish, 'id' | 'name' | 'specialty' | 'wish' | 'status' | 'updatedAt'
>;

// GET /api/wishes?since=<iso>
export interface WishesResponse { wishes: PublicWish[]; now: string }

// POST /api/wishes
export interface SubmitWishRequest {
  name: string; specialty: string; wish: string; deviceHash: string;
}
export type SubmitWishResponse = { ok: true } | { ok: false; error: string };

// GET /api/admin/queue?since=<iso>
export interface AdminQueueResponse { wishes: Wish[]; now: string }

// PATCH /api/admin/wishes/[id]
export interface UpdateWishRequest {
  status?: WishStatus; name?: string; specialty?: string; wish?: string;
}
