"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Checkbox,
  Flex,
  Input,
  Layout,
  Menu,
  Space,
  Typography,
} from "antd";
import {
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import type { CalendarUser } from "@/lib/types";

const { Content, Sider } = Layout;
const { Text, Title } = Typography;

type WorkspaceShellProps = {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  users?: CalendarUser[];
  activeUserIds?: string[];
  onActiveUserIdsChange?: (ids: string[]) => void;
  showMemberFilter?: boolean;
};

const navItems = [
  {
    key: "calendar",
    path: "/",
    icon: <CalendarOutlined />,
    label: "日历总览",
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
  activeUserIds = [],
  children,
  eyebrow = "管理员工作台",
  onActiveUserIdsChange,
  showMemberFilter = false,
  title,
  users = [],
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [memberQuery, setMemberQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();

    if (!query) return users;

    return users.filter((user) => {
      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );
    });
  }, [memberQuery, users]);

  const activeCount = activeUserIds.length;

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
            {showMemberFilter ? (
              <section className="member-filter-panel">
                <Flex align="center" justify="space-between">
                  <div>
                    <Text strong>日历成员</Text>
                    <div className="member-count">
                      已选 {activeCount}/{users.length}
                    </div>
                  </div>
                  <Space size={4}>
                    <Button
                      size="small"
                      type="text"
                      onClick={() =>
                        onActiveUserIdsChange?.(users.map((user) => user.id))
                      }
                    >
                      全选
                    </Button>
                    <Button
                      size="small"
                      type="text"
                      onClick={() => onActiveUserIdsChange?.([])}
                    >
                      清空
                    </Button>
                  </Space>
                </Flex>
                <Input
                  allowClear
                  className="member-search"
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder="搜索成员"
                  prefix={<SearchOutlined />}
                  size="small"
                  value={memberQuery}
                />
                <div className="member-filter-list">
                  {filteredUsers.map((user) => (
                    <Checkbox
                      checked={activeUserIds.includes(user.id)}
                      className="member-filter-row"
                      key={user.id}
                      onChange={(event) => {
                        if (event.target.checked) {
                          onActiveUserIdsChange?.([...activeUserIds, user.id]);
                          return;
                        }

                        onActiveUserIdsChange?.(
                          activeUserIds.filter((id) => id !== user.id),
                        );
                      }}
                    >
                      <span
                        className="legend-dot"
                        style={{ backgroundColor: user.color }}
                      />
                      <span className="member-filter-name">{user.name}</span>
                    </Checkbox>
                  ))}
                </div>
              </section>
            ) : (
              <section className="account-panel">
                <Avatar className="profile-avatar">{initials("田中太郎")}</Avatar>
                <div>
                  <div className="account-name">田中太郎</div>
                  <div className="account-role">管理员</div>
                </div>
              </section>
            )}
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
