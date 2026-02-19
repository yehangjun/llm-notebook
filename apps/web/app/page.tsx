import Link from "next/link";

import { buttonVariants } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-84px)] px-5 pb-10 pt-6">
      <div className="mx-auto w-full max-w-[1080px] space-y-4">
        <Card className="border-border/80 bg-white/95">
          <CardHeader className="space-y-3 pb-4">
            <div className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
              Your AI Learning Companion
            </div>
            <CardTitle className="text-4xl leading-tight md:text-5xl">
              Prism <span className="gradient-text">Everything about AI</span>
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              聚合优质 AI 视频、博客和媒体内容，围绕外部链接沉淀学习笔记，并支持公开分享。这是一个轻量、可持续更新的个人 AI
              知识工作台。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link className={buttonVariants()} href="/auth">
              登录并开始
            </Link>
            <Link className={buttonVariants({ variant: "secondary" })} href="#discover">
              查看能力
            </Link>
          </CardContent>
        </Card>

        <section id="discover" className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">链接即笔记</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                每条笔记绑定一个外部内容链接，聚焦阅读、摘要和结构化理解。
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">AI 辅助总结</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                自动提炼关键信息，帮助你快速建立知识框架，不引入重型编辑流程。
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">公开分享</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                把你的学习路径和笔记公开，让高质量知识在社区持续沉淀。
              </p>
            </CardContent>
          </Card>
        </section>

        <Card id="about">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">产品设计思路</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              Prism 借鉴 NotebookLM 的信息组织方式，但更轻量：不做文件上传和复杂生成产物，以链接驱动的学习笔记为核心，覆盖
              “发现-理解-记录-分享”闭环。
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
