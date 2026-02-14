"use client";

import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const router = useRouter();

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 780 }}>
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>通知中心</h1>
            <button className="btn secondary" type="button" onClick={() => router.push("/feed")}>
              返回广场
            </button>
          </div>
          <div className="helper" style={{ marginTop: 14 }}>
            暂无新通知。
          </div>
        </section>
      </div>
    </main>
  );
}
