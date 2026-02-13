export default function Home() {
  return (
    <main className="page">
      <div className="container">
        <section className="hero card">
          <div className="hero-tag">Your AI Learning Companion</div>
          <h1>
            Prism
            <span className="gradient-text"> Everything about AI</span>
          </h1>
          <p>
            聚合优质 AI 视频、博客和媒体内容，围绕外部链接沉淀学习笔记，并支持公开分享。
            这是一个轻量、可持续更新的个人 AI 知识工作台。
          </p>
          <div className="hero-actions">
            <a className="btn" href="/auth">
              登录并开始
            </a>
            <a className="btn secondary" href="#discover">
              查看能力
            </a>
          </div>
        </section>

        <section id="discover" className="feature-grid">
          <article className="feature-card">
            <h3>链接即笔记</h3>
            <p>每条笔记绑定一个外部内容链接，聚焦阅读、摘要和结构化理解。</p>
          </article>
          <article className="feature-card">
            <h3>AI 辅助总结</h3>
            <p>自动提炼关键信息，帮助你快速建立知识框架，不引入重型编辑流程。</p>
          </article>
          <article className="feature-card">
            <h3>公开分享</h3>
            <p>把你的学习路径和笔记公开，让高质量知识在社区持续沉淀。</p>
          </article>
        </section>

        <section id="about" className="card about">
          <h2>产品设计思路</h2>
          <p>
            Prism 借鉴 NotebookLM 的信息组织方式，但更轻量：不做文件上传和复杂生成产物，
            以链接驱动的学习笔记为核心，覆盖“发现-理解-记录-分享”闭环。
          </p>
        </section>
      </div>
    </main>
  );
}
