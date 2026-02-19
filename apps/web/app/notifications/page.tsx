"use client";

import { useRouter } from "next/navigation";

import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export default function NotificationsPage() {
  const router = useRouter();

  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[780px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-2xl">通知中心</CardTitle>
            <Button variant="secondary" size="sm" type="button" onClick={() => router.push("/feed")}>
              返回广场
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">暂无新通知。</div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
