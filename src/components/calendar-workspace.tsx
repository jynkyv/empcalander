"use client";

import { useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Calendar,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FilterOutlined,
  LeftOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
  TeamOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { demoTasks, demoUsers } from "@/lib/demo-data";
import type {
  CalendarTask,
  CalendarUser,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

const { Content, Sider } = Layout;
const { Text, Title } = Typography;

const currentUserId = "u-admin";

const statusMeta: Record<
  TaskStatus,
  { label: string; color: string; progress: number }
> = {
  todo: { label: "待处理", color: "#7f56d9", progress: 10 },
  doing: { label: "进行中", color: "#2f6fed", progress: 65 },
  done: { label: "已完成", color: "#17a765", progress: 100 },
};

const priorityMeta: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: "低", color: "default" },
  normal: { label: "普通", color: "blue" },
  high: { label: "高", color: "red" },
};

type TaskFormValues = {
  title: string;
  date: Dayjs;
  assigneeIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  description?: string;
};

type MemberFormValues = {
  name: string;
  email: string;
  role: "admin" | "member";
};

function sameDay(task: CalendarTask, date: Dayjs) {
  return dayjs(task.startsAt).isSame(date, "day");
}

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

export function CalendarWorkspace() {
  const [users, setUsers] = useState<CalendarUser[]>(demoUsers);
  const [tasks, setTasks] = useState<CalendarTask[]>(demoTasks);
  const [calendarValue, setCalendarValue] = useState<Dayjs>(dayjs("2026-07-02"));
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs("2026-07-02"));
  const [viewMode, setViewMode] = useState<"team" | "mine">("team");
  const [activeUserIds, setActiveUserIds] = useState<string[]>(
    demoUsers.map((user) => user.id),
  );
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [taskForm] = Form.useForm<TaskFormValues>();
  const [memberForm] = Form.useForm<MemberFormValues>();

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      const mine =
        task.createdBy === currentUserId || task.assigneeIds.includes(currentUserId);
      const inSelectedUsers = task.assigneeIds.some((id) =>
        activeUserIds.includes(id),
      );

      if (viewMode === "mine") {
        return mine;
      }

      return inSelectedUsers;
    });
  }, [activeUserIds, tasks, viewMode]);

  const selectedTasks = useMemo(
    () => visibleTasks.filter((task) => sameDay(task, selectedDate)),
    [selectedDate, visibleTasks],
  );

  const monthTasks = useMemo(
    () =>
      visibleTasks.filter((task) =>
        dayjs(task.startsAt).isSame(calendarValue, "month"),
      ),
    [calendarValue, visibleTasks],
  );

  const doneCount = monthTasks.filter((task) => task.status === "done").length;
  const completion =
    monthTasks.length === 0 ? 0 : Math.round((doneCount / monthTasks.length) * 100);

  const openTaskModal = (date = selectedDate) => {
    taskForm.setFieldsValue({
      date,
      status: "todo",
      priority: "normal",
      assigneeIds: [currentUserId],
    });
    setTaskModalOpen(true);
  };

  const createTask = (values: TaskFormValues) => {
    const nextTask: CalendarTask = {
      id: `task-${Date.now()}`,
      title: values.title,
      description: values.description || "暂无补充说明。",
      startsAt: values.date.hour(9).minute(0).second(0).toISOString(),
      status: values.status,
      priority: values.priority,
      createdBy: currentUserId,
      assigneeIds: values.assigneeIds,
    };

    setTasks((current) => [...current, nextTask]);
    setSelectedDate(values.date);
    setCalendarValue(values.date);
    setTaskModalOpen(false);
    taskForm.resetFields();
  };

  const createMember = (values: MemberFormValues) => {
    const palette = ["#17a765", "#f5a623", "#e5534b", "#00a2ae", "#7f56d9"];
    const nextUser: CalendarUser = {
      id: `user-${Date.now()}`,
      name: values.name,
      email: values.email,
      role: values.role,
      color: palette[users.length % palette.length],
    };

    setUsers((current) => [...current, nextUser]);
    setActiveUserIds((current) => [...current, nextUser.id]);
    setMemberModalOpen(false);
    memberForm.resetFields();
  };

  const renderDateCell = (date: Dayjs) => {
    const dayTasks = visibleTasks.filter((task) => sameDay(task, date));
    const isCurrentMonth = date.month() === calendarValue.month();
    const isSelected = date.isSame(selectedDate, "day");
    const isToday = date.isSame(dayjs(), "day");

    return (
      <div
        className={[
          "calendar-day",
          isCurrentMonth ? "" : "is-muted",
          isSelected ? "is-selected" : "",
        ].join(" ")}
      >
        <div className="calendar-day-header">
          <span className={isToday ? "today-number" : ""}>{date.date()}</span>
          {dayTasks.length > 0 ? (
            <Badge count={dayTasks.length} color="#2f6fed" size="small" />
          ) : null}
        </div>
        <div className="calendar-events">
          {dayTasks.slice(0, 3).map((task) => {
            const owner = userById.get(task.assigneeIds[0]);
            return (
              <div
                className="task-pill"
                key={task.id}
                style={{
                  borderColor: owner?.color || "#d8dee9",
                  backgroundColor: `${owner?.color || "#2f6fed"}17`,
                }}
              >
                <span
                  className="task-dot"
                  style={{ backgroundColor: owner?.color || "#2f6fed" }}
                />
                <span className="task-title">{task.title}</span>
              </div>
            );
          })}
          {dayTasks.length > 3 ? (
            <Text className="more-count" type="secondary">
              +{dayTasks.length - 3} 项
            </Text>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Layout className="workspace">
      <Sider width={220} className="workspace-sider">
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
          selectedKeys={["calendar"]}
          items={[
            { key: "calendar", icon: <CalendarOutlined />, label: "日历总览" },
            { key: "tasks", icon: <CheckSquareOutlined />, label: "我的任务" },
            { key: "team", icon: <TeamOutlined />, label: "员工账号" },
            { key: "notice", icon: <BellOutlined />, label: "公告通知" },
            { key: "settings", icon: <SettingOutlined />, label: "设置管理" },
          ]}
        />
        <div className="legend-panel">
          <Text strong>日历成员</Text>
          <div className="legend-list">
            {users.map((user) => (
              <label className="legend-row" key={user.id}>
                <input
                  checked={activeUserIds.includes(user.id)}
                  onChange={(event) => {
                    setActiveUserIds((current) =>
                      event.target.checked
                        ? [...current, user.id]
                        : current.filter((id) => id !== user.id),
                    );
                  }}
                  type="checkbox"
                />
                <span
                  className="legend-dot"
                  style={{ backgroundColor: user.color }}
                />
                <span>{user.name}</span>
              </label>
            ))}
          </div>
        </div>
      </Sider>

      <Layout className="workspace-main">
        <header className="topbar">
          <div>
            <Text type="secondary">管理员工作台</Text>
            <Title level={3}>团队任务日历</Title>
          </div>
          <Space size={12} wrap>
            <Segmented
              onChange={(value) => setViewMode(value as "team" | "mine")}
              options={[
                { label: "全员日历", value: "team" },
                { label: "我的日历", value: "mine" },
              ]}
              value={viewMode}
            />
            <Tooltip title="成员筛选">
              <Button icon={<FilterOutlined />} />
            </Tooltip>
            <Button icon={<UserAddOutlined />} onClick={() => setMemberModalOpen(true)}>
              开账号
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => openTaskModal()}
              type="primary"
            >
              新增任务
            </Button>
            <Avatar className="profile-avatar">{initials("田中太郎")}</Avatar>
          </Space>
        </header>

        <Content className="content-grid">
          <section className="calendar-panel">
            <Calendar
              fullCellRender={(date) => renderDateCell(date)}
              headerRender={({ value, onChange }) => {
                const moveMonth = (offset: number) => {
                  const next = value.add(offset, "month");
                  setCalendarValue(next);
                  onChange(next);
                };

                const goToday = () => {
                  const today = dayjs();
                  setCalendarValue(today);
                  setSelectedDate(today);
                  onChange(today);
                };

                return (
                  <div className="calendar-header">
                    <Flex align="center" gap={10}>
                      <Title level={4}>{value.format("YYYY年M月")}</Title>
                      <Button icon={<LeftOutlined />} onClick={() => moveMonth(-1)} />
                      <Button icon={<RightOutlined />} onClick={() => moveMonth(1)} />
                      <Button onClick={goToday}>今天</Button>
                    </Flex>
                    <Segmented
                      options={[
                        { label: "月", value: "month" },
                        { label: "年", value: "year" },
                      ]}
                      value="month"
                    />
                  </div>
                );
              }}
              onPanelChange={(date) => setCalendarValue(date)}
              onSelect={(date) => {
                setSelectedDate(date);
                setCalendarValue(date);
                setDetailOpen(true);
              }}
              value={calendarValue}
            />
          </section>

          <aside className="detail-panel">
            <div className="detail-header">
              <div>
                <Text type="secondary">{selectedDate.format("M月D日 dddd")}</Text>
                <Title level={4}>当天任务</Title>
              </div>
              <Button icon={<MoreOutlined />} />
            </div>
            <Progress percent={completion} size="small" strokeColor="#17a765" />
            <div className="summary-row">
              <span>本月任务 {monthTasks.length}</span>
              <span>已完成 {doneCount}</span>
            </div>
            <div className="task-detail-list">
              {selectedTasks.length === 0 ? (
                <Empty description="当天暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                selectedTasks.map((task) => (
                  <TaskDetailCard key={task.id} task={task} userById={userById} />
                ))
              )}
            </div>
          </aside>
        </Content>
      </Layout>

      <Drawer
        className="mobile-detail-drawer"
        onClose={() => setDetailOpen(false)}
        open={detailOpen}
        title={selectedDate.format("M月D日任务")}
      >
        {selectedTasks.length === 0 ? (
          <Empty description="当天暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {selectedTasks.map((task) => (
              <TaskDetailCard key={task.id} task={task} userById={userById} />
            ))}
          </Space>
        )}
      </Drawer>

      <Modal
        destroyOnHidden
        okText="创建任务"
        onCancel={() => setTaskModalOpen(false)}
        onOk={() => taskForm.submit()}
        open={taskModalOpen}
        title="新增任务"
      >
        <Form form={taskForm} layout="vertical" onFinish={createTask}>
          <Form.Item
            label="任务标题"
            name="title"
            rules={[{ message: "请输入任务标题", required: true }]}
          >
            <Input placeholder="例如：办公室电脑安装" />
          </Form.Item>
          <Form.Item
            label="日期"
            name="date"
            rules={[{ message: "请选择日期", required: true }]}
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="负责人"
            name="assigneeIds"
            rules={[{ message: "请选择负责人", required: true }]}
          >
            <Select
              mode="multiple"
              options={users.map((user) => ({
                label: user.name,
                value: user.id,
              }))}
            />
          </Form.Item>
          <Flex gap={12}>
            <Form.Item label="状态" name="status" style={{ flex: 1 }}>
              <Select
                options={[
                  { label: "待处理", value: "todo" },
                  { label: "进行中", value: "doing" },
                  { label: "已完成", value: "done" },
                ]}
              />
            </Form.Item>
            <Form.Item label="优先级" name="priority" style={{ flex: 1 }}>
              <Select
                options={[
                  { label: "低", value: "low" },
                  { label: "普通", value: "normal" },
                  { label: "高", value: "high" },
                ]}
              />
            </Form.Item>
          </Flex>
          <Form.Item label="说明" name="description">
            <Input.TextArea placeholder="补充任务背景、交付要求或注意事项" rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        destroyOnHidden
        okText="创建账号"
        onCancel={() => setMemberModalOpen(false)}
        onOk={() => memberForm.submit()}
        open={memberModalOpen}
        title="开员工账号"
      >
        <Form
          form={memberForm}
          initialValues={{ role: "member" }}
          layout="vertical"
          onFinish={createMember}
        >
          <Form.Item
            label="姓名"
            name="name"
            rules={[{ message: "请输入姓名", required: true }]}
          >
            <Input placeholder="员工姓名" />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { message: "请输入邮箱", required: true },
              { message: "邮箱格式不正确", type: "email" },
            ]}
          >
            <Input placeholder="name@company.com" />
          </Form.Item>
          <Form.Item label="角色" name="role">
            <Select
              options={[
                { label: "普通员工", value: "member" },
                { label: "管理员", value: "admin" },
              ]}
            />
          </Form.Item>
          <Text type="secondary">
            当前是前端原型新增；接入 Supabase 后会调用
            <code> /api/admin/users</code> 创建真实登录账号。
          </Text>
        </Form>
      </Modal>
    </Layout>
  );
}

function TaskDetailCard({
  task,
  userById,
}: {
  task: CalendarTask;
  userById: Map<string, CalendarUser>;
}) {
  const assignees = task.assigneeIds
    .map((id) => userById.get(id))
    .filter(Boolean) as CalendarUser[];
  const status = statusMeta[task.status];
  const priority = priorityMeta[task.priority];

  return (
    <article className="task-card">
      <div className="task-card-top">
        <div>
          <Title level={5}>{task.title}</Title>
          <Text type="secondary">{dayjs(task.startsAt).format("HH:mm")}</Text>
        </div>
        <Tag color={status.color}>{status.label}</Tag>
      </div>
      <p>{task.description}</p>
      <Progress percent={status.progress} showInfo={false} size="small" />
      <div className="task-meta">
        <Tag color={priority.color}>优先级 {priority.label}</Tag>
        <Avatar.Group max={{ count: 3 }}>
          {assignees.map((user) => (
            <Tooltip key={user.id} title={user.name}>
              <Avatar style={{ backgroundColor: user.color }}>
                {initials(user.name)}
              </Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      </div>
    </article>
  );
}
