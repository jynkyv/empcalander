"use client";

import type { ReactNode } from "react";
import { Layout, Typography } from "antd";

const { Content } = Layout;
const { Text, Title } = Typography;

type WorkspaceShellProps = {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function WorkspaceShell({
  actions,
  children,
  eyebrow = "管理员工作台",
  title,
}: WorkspaceShellProps) {
  return (
    <Layout className="workspace">
      <Layout className="workspace-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="brand topbar-brand">
              <div className="brand-mark">A</div>
              <div>
                <div className="brand-name">AG GROUP</div>
                <div className="brand-subtitle">工作日历</div>
              </div>
            </div>
            <div className="topbar-title">
              <Text type="secondary">{eyebrow}</Text>
              <Title level={3}>{title}</Title>
            </div>
          </div>
          {actions ? <div className="topbar-actions">{actions}</div> : null}
        </header>
        <Content>{children}</Content>
      </Layout>
    </Layout>
  );
}
