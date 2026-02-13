import AccountEntry from "../components/AccountEntry";

export default function Home() {
  return (
    <main className="page">
      <div className="container">
        <div className="topbar">
          <AccountEntry />
        </div>

        <section className="card hero">
          <h1>LLM Notebook V2</h1>
          <p>面向中文用户的 AI 信息聚合与学习笔记。当前版本提供账号体系、认证与资料闭环。</p>
        </section>
      </div>
    </main>
  );
}
