"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Layout, Menu, Typography } from "antd";
import {
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";

const { Content, Sider } = Layout;
const { Text, Title } = Typography;

type WorkspaceShellProps = {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const navItems = [
  {
    key: "calendar",
    path: "/",
    icon: <CalendarOutlined />,
    label: "日历",
  },
  {
    key: "tasks",
    path: "/tasks",
    icon: <CheckSquareOutlined />,
    label: "我的任务",
  },
  {
    key: "team",
    path: "/team",
    icon: <TeamOutlined />,
    label: "员工账号",
  },
  {
    key: "notice",
    path: "/notice",
    icon: <BellOutlined />,
    label: "公告通知",
  },
  {
    key: "settings",
    path: "/settings",
    icon: <SettingOutlined />,
    label: "设置管理",
  },
];

function selectedNavKey(pathname: string) {
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/notice")) return "notice";
  if (pathname.startsWith("/settings")) return "settings";
  return "calendar";
}

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

export function WorkspaceShell({
  actions,
  children,
  eyebrow = "管理员工作台",
  title,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Layout className="workspace">
      <Sider width={232} className="workspace-sider">
        <div className="sidebar-frame">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div>
              <div className="brand-name">AG集团</div>
              <div className="brand-subtitle">工作日历</div>
            </div>
          </div>

          <Menu
            className="side-menu"
            mode="inline"
            onClick={({ key }) => {
              const item = navItems.find((navItem) => navItem.key === key);
              if (item) router.push(item.path);
            }}
            selectedKeys={[selectedNavKey(pathname)]}
            items={navItems.map(({ key, icon, label }) => ({ key, icon, label }))}
          />

          <div className="sidebar-footer">
            <section className="account-panel">
              <Avatar className="profile-avatar">{initials("田中太郎")}</Avatar>
              <div>
                <div className="account-name">田中太郎</div>
                <div className="account-role">管理员</div>
              </div>
            </section>
          </div>
        </div>
      </Sider>

      <Layout className="workspace-main">
        <header className="topbar">
          <div>
            <Text type="secondary">{eyebrow}</Text>
            <Title level={3}>{title}</Title>
          </div>
          {actions ? <div className="topbar-actions">{actions}</div> : null}
        </header>
        <Content>{children}</Content>
      </Layout>
    </Layout>
  );
}
