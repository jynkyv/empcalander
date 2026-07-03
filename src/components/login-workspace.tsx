"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Form, Input, Space, Spin, Typography } from "antd";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  bootstrapAdminPassword,
  hasSupabaseConfig,
  normalizeLoginEmail,
} from "@/lib/auth-config";
import { createClient } from "@/lib/supabase/client";

const { Text, Title } = Typography;

type LoginFormValues = {
  email: string;
  password: string;
};

export function LoginWorkspace() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<LoginFormValues>();
  const [supabase] = useState(() => (hasSupabaseConfig ? createClient() : null));
  const [checkingSession, setCheckingSession] = useState(hasSupabaseConfig);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

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

  const bootstrapAdmin = async () => {
    setBootstrapping(true);
    const response = await fetch("/api/admin/bootstrap", { method: "POST" });
    const payload = (await response.json()) as {
      error?: string;
      user?: { login: string; password: string };
    };
    setBootstrapping(false);

    if (!response.ok) {
      message.error(payload.error || "初始化管理员失败");
      return;
    }

    form.setFieldsValue({
      email: payload.user?.login || "admin",
      password: payload.user?.password || bootstrapAdminPassword,
    });
    message.success("管理员已初始化，可以登录");
  };

  if (!hasSupabaseConfig || !supabase) {
    return (
      <WorkspaceShell eyebrow="Supabase 配置" title="登录">
        <div className="setup-panel">
          <Alert
            description="请先在 .env.local 填入 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 和 SUPABASE_SECRET_KEY，然后重启 pnpm dev。"
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
          <Form
            form={form}
            initialValues={{ email: "admin", password: bootstrapAdminPassword }}
            layout="vertical"
            onFinish={signIn}
          >
            <Form.Item
              label="账号"
              name="email"
              rules={[{ message: "请输入账号或邮箱", required: true }]}
            >
              <Input placeholder="admin 或 name@company.com" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ message: "请输入密码", required: true }]}
            >
              <Input.Password placeholder="admin123" />
            </Form.Item>
            <Space wrap>
              <Button htmlType="submit" loading={submitting} type="primary">
                登录
              </Button>
              <Button loading={bootstrapping} onClick={bootstrapAdmin}>
                初始化管理员
              </Button>
            </Space>
          </Form>
          <Text type="secondary">
            默认管理员：<code>admin</code> / <code>{bootstrapAdminPassword}</code>
          </Text>
        </section>
      </div>
    </WorkspaceShell>
  );
}
