import { Suspense } from "react";

import ResetPasswordClient from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="container" style={{ maxWidth: 560 }}>
            <section className="card">加载中...</section>
          </div>
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
