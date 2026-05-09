import { clsx } from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse bg-slate-800 rounded-lg", className)} />;
}

export function ChatListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="w-11 h-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CharacterListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 p-3 rounded-xl border border-slate-800">
          <Skeleton className="w-14 h-14 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-full" />
            <div className="flex gap-1">
              <Skeleton className="h-4 w-10 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex gap-2">
        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
        <Skeleton className="h-16 w-3/5 rounded-2xl" />
      </div>
      <div className="flex gap-2 flex-row-reverse">
        <Skeleton className="h-10 w-2/5 rounded-2xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
        <Skeleton className="h-24 w-4/5 rounded-2xl" />
      </div>
    </div>
  );
}
