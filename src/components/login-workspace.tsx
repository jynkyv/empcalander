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
  account: string;
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
      email: normalizeLoginEmail(values.account),
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
      <WorkspaceShell eyebrow="Supabase 設定" title="ログイン">
        <div className="setup-panel">
          <Alert
            description=".env.local に SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY、SUPABASE_JWKS_URL を設定してから pnpm dev を再起動してください。"
            message="Supabase 環境変数が不足しています"
            showIcon
            type="warning"
          />
        </div>
      </WorkspaceShell>
    );
  }

  if (checkingSession) {
    return (
      <WorkspaceShell eyebrow="ログイン状態を確認中" title="ログイン">
        <div className="loading-panel">
          <Spin />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell eyebrow="勤務カレンダーにログイン" title="ログイン">
      <div className="auth-shell">
        <section className="auth-panel">
          <Title level={4}>ログイン</Title>
          <Form layout="vertical" onFinish={signIn}>
            <Form.Item
              label="アカウント"
              name="account"
              rules={[{ message: "アカウントを入力してください", required: true }]}
            >
              <Input placeholder="アカウントを入力" />
            </Form.Item>
            <Form.Item
              label="パスワード"
              name="password"
              rules={[{ message: "パスワードを入力してください", required: true }]}
            >
              <Input.Password placeholder="パスワードを入力" />
            </Form.Item>
            <Button htmlType="submit" loading={submitting} type="primary">
              ログイン
            </Button>
          </Form>
        </section>
      </div>
    </WorkspaceShell>
  );
}
