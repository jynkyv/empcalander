"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Form, Input, Spin, Typography } from "antd";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  hasSupabaseConfig,
  normalizeLoginEmail,
  type SupabaseBrowserConfig,
} from "@/lib/auth-config";
import { createClient } from "@/lib/supabase/client";

const { Title } = Typography;

type LoginFormValues = {
  email: string;
  password: string;
};

export function LoginWorkspace({
  supabaseConfig,
}: {
  supabaseConfig: SupabaseBrowserConfig;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const hasConfig = hasSupabaseConfig(supabaseConfig);
  const [supabase] = useState(() =>
    hasConfig ? createClient(supabaseConfig) : null,
  );
  const [checkingSession, setCheckingSession] = useState(hasConfig);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const checkSession = window.setTimeout(async () => {
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        router.replace("/");
        return;
      }

      setCheckingSession(false);
    }, 0);

    return () => window.clearTimeout(checkSession);
  }, [router, supabase]);

  const signIn = async (values: LoginFormValues) => {
    if (!supabase) return;

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeLoginEmail(values.email),
      password: values.password,
    });
    setSubmitting(false);

    if (error) {
      message.error(error.message);
      return;
    }

    router.replace("/");
  };

  if (!hasConfig || !supabase) {
    return (
      <WorkspaceShell eyebrow="Supabase 配置" title="登录">
        <div className="setup-panel">
          <Alert
            description="请先在 .env.local 填入 SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY 和 SUPABASE_JWKS_URL，然后重启 pnpm dev。"
            message="缺少 Supabase 环境变量"
            showIcon
            type="warning"
          />
        </div>
      </WorkspaceShell>
    );
  }

  if (checkingSession) {
    return (
      <WorkspaceShell eyebrow="正在检查登录状态" title="登录">
        <div className="loading-panel">
          <Spin />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell eyebrow="登录工作日历" title="登录">
      <div className="auth-shell">
        <section className="auth-panel">
          <Title level={4}>登录</Title>
          <Form layout="vertical" onFinish={signIn}>
            <Form.Item
              label="账号"
              name="email"
              rules={[{ message: "请输入账号或邮箱", required: true }]}
            >
              <Input placeholder="账号或邮箱" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ message: "请输入密码", required: true }]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
            <Button htmlType="submit" loading={submitting} type="primary">
              登录
            </Button>
          </Form>
        </section>
      </div>
    </WorkspaceShell>
  );
}
