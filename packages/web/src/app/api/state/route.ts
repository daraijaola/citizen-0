import { NextResponse } from "next/server";
import { loadDiary, loadSnapshot } from "@/lib/load-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const [snap, diary] = await Promise.all([loadSnapshot(), loadDiary()]);
  return NextResponse.json(
    {
      snapshot: snap,
      diary: diary.slice(-40).reverse(),
      serverTime: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
