"use client";

import { useMemo, useState } from "react";
import {
  Avatar,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import {
  BellOutlined,
  CheckOutlined,
  SaveOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import { demoTasks, demoUsers } from "@/lib/demo-data";
import type { CalendarTask, CalendarUser, TaskStatus } from "@/lib/types";

const { Text, Title } = Typography;

const currentUserId = "u-admin";

const statusLabels: Record<TaskStatus, string> = {
  todo: "待处理",
  doing: "进行中",
  done: "已完成",
};

const statusColors: Record<TaskStatus, string> = {
  todo: "purple",
  doing: "blue",
  done: "green",
};

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

function userMap(users: CalendarUser[]) {
  return new Map(users.map((user) => [user.id, user]));
}

export function TasksWorkspace() {
  const users = demoUsers;
  const usersById = userMap(users);
  const [status, setStatus] = useState<"all" | TaskStatus>("all");

  const myTasks = useMemo(() => {
    return demoTasks
      .filter(
        (task) =>
          task.createdBy === currentUserId ||
          task.assigneeIds.includes(currentUserId),
      )
      .filter((task) => status === "all" || task.status === status)
      .sort((a, b) => dayjs(a.startsAt).valueOf() - dayjs(b.startsAt).valueOf());
  }, [status]);

  const doneCount = myTasks.filter((task) => task.status === "done").length;
  const completion =
    myTasks.length === 0 ? 0 : Math.round((doneCount / myTasks.length) * 100);

  return (
    <WorkspaceShell
      actions={
        <Space size={12} wrap>
          <Segmented
            onChange={(value) => setStatus(value as "all" | TaskStatus)}
            options={[
              { label: "全部", value: "all" },
              { label: "待处理", value: "todo" },
              { label: "进行中", value: "doing" },
              { label: "已完成", value: "done" },
            ]}
            value={status}
          />
          <Button icon={<CheckOutlined />} type="primary">
            批量完成
          </Button>
        </Space>
      }
      title="我的任务"
    >
      <main className="page-shell">
        <section className="metric-grid">
          <MetricCard label="当前任务" value={myTasks.length} />
          <MetricCard label="已完成" value={doneCount} />
          <MetricCard label="完成率" value={`${completion}%`} />
        </section>

        <section className="work-panel">
          <div className="panel-header">
            <div>
              <Title level={4}>任务列表</Title>
              <Text type="secondary">按指派和自建任务汇总。</Text>
            </div>
            <Progress percent={completion} size="small" style={{ width: 180 }} />
          </div>
          <div className="task-table">
            {myTasks.map((task) => (
              <TaskRow key={task.id} task={task} usersById={usersById} />
            ))}
          </div>
        </section>
      </main>
    </WorkspaceShell>
  );
}

export function TeamWorkspace() {
  const [users, setUsers] = useState(demoUsers);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ name: string; email: string; role: "admin" | "member" }>();

  const createUser = (values: {
    name: string;
    email: string;
    role: "admin" | "member";
  }) => {
    const colors = ["#2f6fed", "#17a765", "#f5a623", "#e5534b", "#7f56d9"];
    setUsers((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        name: values.name,
        email: values.email,
        role: values.role,
        color: colors[current.length % colors.length],
      },
    ]);
    form.resetFields();
    setOpen(false);
  };

  return (
    <WorkspaceShell
      actions={
        <Button icon={<UserAddOutlined />} onClick={() => setOpen(true)} type="primary">
          开账号
        </Button>
      }
      title="员工账号"
    >
      <main className="page-shell">
        <section className="work-panel">
          <div className="panel-header">
            <div>
              <Title level={4}>员工列表</Title>
              <Text type="secondary">管理员能创建账号，后续会接 Supabase Auth。</Text>
            </div>
            <Input.Search className="panel-search" placeholder="搜索姓名或邮箱" />
          </div>
          <div className="people-grid">
            {users.map((user) => (
              <article className="person-card" key={user.id}>
                <Avatar size={44} style={{ backgroundColor: user.color }}>
                  {initials(user.name)}
                </Avatar>
                <div className="person-main">
                  <div className="person-name">{user.name}</div>
                  <Text type="secondary">{user.email}</Text>
                </div>
                <Tag color={user.role === "admin" ? "blue" : "default"}>
                  {user.role === "admin" ? "管理员" : "员工"}
                </Tag>
              </article>
            ))}
          </div>
        </section>
      </main>

      <Modal
        destroyOnHidden
        okText="创建账号"
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        open={open}
        title="开员工账号"
      >
        <Form
          form={form}
          initialValues={{ role: "member" }}
          layout="vertical"
          onFinish={createUser}
        >
          <Form.Item
            label="姓名"
            name="name"
            rules={[{ message: "请输入姓名", required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { message: "请输入邮箱", required: true },
              { message: "邮箱格式不正确", type: "email" },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="角色" name="role">
            <Select
              options={[
                { label: "普通员工", value: "member" },
                { label: "管理员", value: "admin" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </WorkspaceShell>
  );
}

export function NoticeWorkspace() {
  const notices = [
    {
      title: "7月设备巡检安排",
      scope: "全员",
      date: "2026-07-02",
      body: "本月 IT 设备巡检会分批进行，涉及办公室、会议室和前台设备。",
    },
    {
      title: "请及时更新任务状态",
      scope: "员工",
      date: "2026-07-01",
      body: "被指派任务请在当天完成状态更新，管理员会按日历汇总查看。",
    },
    {
      title: "账号权限调整窗口",
      scope: "管理员",
      date: "2026-06-30",
      body: "新员工账号和权限调整统一由管理员在员工账号页面处理。",
    },
  ];

  return (
    <WorkspaceShell
      actions={
        <Button icon={<BellOutlined />} type="primary">
          发布公告
        </Button>
      }
      title="公告通知"
    >
      <main className="page-shell split-page">
        <section className="work-panel">
          <div className="panel-header">
            <div>
              <Title level={4}>公告列表</Title>
              <Text type="secondary">面向员工或管理员的通知。</Text>
            </div>
          </div>
          <div className="notice-list">
            {notices.map((notice) => (
              <article className="notice-card" key={notice.title}>
                <div>
                  <Title level={5}>{notice.title}</Title>
                  <Text type="secondary">{notice.body}</Text>
                </div>
                <Space>
                  <Tag color="blue">{notice.scope}</Tag>
                  <Text type="secondary">{notice.date}</Text>
                </Space>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel compose-panel">
          <Title level={4}>快速发布</Title>
          <Form layout="vertical">
            <Form.Item label="标题">
              <Input placeholder="公告标题" />
            </Form.Item>
            <Form.Item label="范围">
              <Select
                defaultValue="all"
                options={[
                  { label: "全员", value: "all" },
                  { label: "管理员", value: "admin" },
                  { label: "员工", value: "member" },
                ]}
              />
            </Form.Item>
            <Form.Item label="发布时间">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="内容">
              <Input.TextArea rows={5} />
            </Form.Item>
            <Button block type="primary">
              发布
            </Button>
          </Form>
        </section>
      </main>
    </WorkspaceShell>
  );
}

export function SettingsWorkspace() {
  return (
    <WorkspaceShell
      actions={
        <Button icon={<SaveOutlined />} type="primary">
          保存设置
        </Button>
      }
      title="设置管理"
    >
      <main className="page-shell split-page">
        <section className="work-panel">
          <Title level={4}>日历规则</Title>
          <div className="settings-list">
            <SettingRow
              checked
              description="新任务会默认以当前登录人为创建者。"
              label="允许员工给自己安排任务"
            />
            <SettingRow
              checked
              description="管理员日历合并展示所有员工任务。"
              label="管理员查看全员日历"
            />
            <SettingRow
              description="关闭后普通员工只能看到自己的任务。"
              label="员工互相查看任务"
            />
          </div>
        </section>

        <section className="work-panel">
          <Title level={4}>默认配置</Title>
          <Form layout="vertical">
            <Form.Item label="默认任务状态">
              <Select
                defaultValue="todo"
                options={[
                  { label: "待处理", value: "todo" },
                  { label: "进行中", value: "doing" },
                ]}
              />
            </Form.Item>
            <Form.Item label="默认视图">
              <Select
                defaultValue="month"
                options={[
                  { label: "月视图", value: "month" },
                  { label: "周视图", value: "week" },
                ]}
              />
            </Form.Item>
            <Form.Item label="公司名称">
              <Input defaultValue="AG集团" />
            </Form.Item>
          </Form>
        </section>
      </main>
    </WorkspaceShell>
  );
}

function TaskRow({
  task,
  usersById,
}: {
  task: CalendarTask;
  usersById: Map<string, CalendarUser>;
}) {
  const assignees = task.assigneeIds
    .map((id) => usersById.get(id))
    .filter(Boolean) as CalendarUser[];

  return (
    <article className="task-row">
      <div>
        <Title level={5}>{task.title}</Title>
        <Text type="secondary">{task.description}</Text>
      </div>
      <div className="task-row-meta">
        <Text>{dayjs(task.startsAt).format("M月D日 HH:mm")}</Text>
        <Tag color={statusColors[task.status]}>{statusLabels[task.status]}</Tag>
        <Avatar.Group max={{ count: 3 }}>
          {assignees.map((user) => (
            <Avatar key={user.id} style={{ backgroundColor: user.color }}>
              {initials(user.name)}
            </Avatar>
          ))}
        </Avatar.Group>
      </div>
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="metric-card">
      <Text type="secondary">{label}</Text>
      <strong>{value}</strong>
    </article>
  );
}

function SettingRow({
  checked,
  description,
  label,
}: {
  checked?: boolean;
  description: string;
  label: string;
}) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-label">{label}</div>
        <Text type="secondary">{description}</Text>
      </div>
      <Switch defaultChecked={checked} />
    </div>
  );
}
