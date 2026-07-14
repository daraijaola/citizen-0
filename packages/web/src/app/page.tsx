import { ResidentRecord } from "@/components/ResidentRecord";
import { loadDiary, loadSnapshot } from "@/lib/load-state";

export const dynamic = "force-dynamic";

export default async function ResidentRecordPage() {
  const [snapshot, diary] = await Promise.all([loadSnapshot(), loadDiary()]);
  return (
    <ResidentRecord
      initial={{
        snapshot,
        diary: diary.slice(-40).reverse(),
        serverTime: Date.now(),
      }}
    />
  );
}
