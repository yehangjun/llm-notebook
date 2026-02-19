import { Suspense } from "react";

import { Card, CardContent } from "../../components/ui/card";
import ResetPasswordClient from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
          <div className="mx-auto w-full max-w-[640px]">
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">加载中...</CardContent>
            </Card>
          </div>
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
