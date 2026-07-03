"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  App,
  Avatar,
  Button,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  DeleteOutlined,
  LeftOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  emailToAccount,
  getAccountValidationError,
  hasSupabaseConfig,
  type SupabaseBrowserConfig,
} from "@/lib/auth-config";
import { createClient } from "@/lib/supabase/client";
import type {
  CalendarTask,
  CalendarUser,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

type CalendarScope = "all" | "sent" | "received";
type TaskRelation = "sent" | "received";

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

const prioritySignalColor: Record<TaskPriority, string> = {
  low: "#98a2b3",
  normal: "#2f6fed",
  high: "#e5484d",
};

const relationMeta: Record<
  TaskRelation,
  { label: string; color: string; mid: string; soft: string; trail: string }
> = {
  sent: {
    label: "我发出的",
    color: "#2f6fed",
    mid: "#dce9ff",
    soft: "#eef5ff",
    trail: "#e7eefc",
  },
  received: {
    label: "发给我的",
    color: "#f59e0b",
    mid: "#ffedc2",
    soft: "#fff7e6",
    trail: "#f8edd6",
  },
};

type TaskFormValues = {
  title: string;
  range: [Dayjs, Dayjs];
  assigneeIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  description?: string;
};

type MemberFormValues = {
  account: string;
  password: string;
  role: "admin" | "member";
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: CalendarUser["role"];
  color: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_by: string;
  task_assignees?: { user_id: string }[] | null;
};

function startOfCalendarMonth(month: Dayjs) {
  const firstDay = month.startOf("month");
  const weekday = firstDay.day();
  const offset = weekday === 0 ? 6 : weekday - 1;

  return firstDay.subtract(offset, "day");
}

function endOfCalendarMonth(month: Dayjs) {
  const lastDay = month.endOf("month").startOf("day");
  const weekday = lastDay.day();
  const offset = weekday === 0 ? 0 : 7 - weekday;

  return lastDay.add(offset, "day");
}

function endOfTask(task: CalendarTask) {
  return dayjs(task.endsAt || task.startsAt);
}

function isTaskOnDate(task: CalendarTask, date: Dayjs) {
  const start = dayjs(task.startsAt);
  const end = endOfTask(task);

  return (
    start.isBefore(date.endOf("day")) &&
    end.isAfter(date.startOf("day")) &&
    !end.isBefore(start)
  );
}

function taskIntersectsRange(task: CalendarTask, start: Dayjs, end: Dayjs) {
  return (
    dayjs(task.startsAt).isBefore(end.endOf("day")) &&
    endOfTask(task).isAfter(start.startOf("day"))
  );
}

function clampTaskToWeek(task: CalendarTask, weekStart: Dayjs) {
  const weekEnd = weekStart.add(6, "day");
  const taskStart = dayjs(task.startsAt).startOf("day");
  const taskEnd = endOfTask(task).startOf("day");
  const segmentStart = taskStart.isBefore(weekStart) ? weekStart : taskStart;
  const segmentEnd = taskEnd.isAfter(weekEnd) ? weekEnd : taskEnd;

  if (segmentEnd.isBefore(weekStart) || segmentStart.isAfter(weekEnd)) {
    return null;
  }

  return {
    startColumn: segmentStart.diff(weekStart, "day") + 1,
    span: segmentEnd.diff(segmentStart, "day") + 1,
    continuesBefore: taskStart.isBefore(weekStart),
    continuesAfter: taskEnd.isAfter(weekEnd),
  };
}

function profileToUser(profile: ProfileRow): CalendarUser {
  return {
    id: profile.id,
    name: emailToAccount(profile.email) || profile.full_name,
    email: profile.email,
    role: profile.role,
    color: profile.color || "#2f6fed",
  };
}

function taskRowToTask(task: TaskRow): CalendarTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description || "暂无补充说明。",
    startsAt: task.starts_at,
    endsAt: task.ends_at || undefined,
    status: task.status,
    priority: task.priority,
    createdBy: task.created_by,
    assigneeIds: (task.task_assignees || []).map((assignee) => assignee.user_id),
  };
}

function isSentTask(task: CalendarTask, currentUserId: string) {
  return task.createdBy === currentUserId;
}

function isReceivedTask(task: CalendarTask, currentUserId: string) {
  return task.createdBy !== currentUserId && task.assigneeIds.includes(currentUserId);
}

function taskMatchesScope(
  task: CalendarTask,
  scope: CalendarScope,
  currentUserId: string,
  isAdmin: boolean,
) {
  if (scope === "sent") return isSentTask(task, currentUserId);
  if (scope === "received") return isReceivedTask(task, currentUserId);

  return isAdmin || isSentTask(task, currentUserId) || isReceivedTask(task, currentUserId);
}

function relationForTask(task: CalendarTask, currentUserId: string): TaskRelation {
  return isReceivedTask(task, currentUserId) ? "received" : "sent";
}

function relationLabelForTask(task: CalendarTask, currentUserId: string) {
  if (isReceivedTask(task, currentUserId)) return "发给我的";
  if (isSentTask(task, currentUserId)) return "我发出的";
  return "他人发出";
}

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

function formatTaskRange(task: CalendarTask) {
  const start = dayjs(task.startsAt);
  const end = endOfTask(task);

  if (start.isSame(end, "day")) {
    return `${start.format("M月D日 HH:mm")} - ${end.format("HH:mm")}`;
  }

  return `${start.format("M月D日 HH:mm")} - ${end.format("M月D日 HH:mm")}`;
}

export function CalendarWorkspace({
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
  const [currentUser, setCurrentUser] = useState<CalendarUser | null>(null);
  const [users, setUsers] = useState<CalendarUser[]>([]);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [calendarValue, setCalendarValue] = useState<Dayjs>(dayjs());
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [calendarScope, setCalendarScope] = useState<CalendarScope>("all");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskForm] = Form.useForm<TaskFormValues>();
  const [memberForm] = Form.useForm<MemberFormValues>();

  const currentUserId = currentUser?.id || "";
  const canManageAccounts = currentUser?.role === "admin";

  const loadWorkspaceData = useCallback(async () => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    setDataLoading(true);
    setWorkspaceError(null);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authUser = authData.user;

    if (authError || !authUser) {
      setCurrentUser(null);
      setUsers([]);
      setTasks([]);
      setAuthLoading(false);
      setDataLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,color")
      .eq("id", authUser.id)
      .maybeSingle<ProfileRow>();

    if (profileError || !profile) {
      setWorkspaceError(
        profileError?.message || "当前账号还没有 profile，请确认已执行 schema.sql。",
      );
      setCurrentUser(null);
      setAuthLoading(false);
      setDataLoading(false);
      return;
    }

    const currentProfile = profileToUser(profile);
    setCurrentUser(currentProfile);

    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,color")
      .order("created_at", { ascending: true })
      .returns<ProfileRow[]>();

    if (profilesError) {
      setWorkspaceError(profilesError.message);
      setUsers([currentProfile]);
    } else {
      setUsers((profileRows || []).map(profileToUser));
    }

    const { data: taskRows, error: tasksError } = await supabase
      .from("tasks")
      .select(
        "id,title,description,starts_at,ends_at,status,priority,created_by,task_assignees(user_id)",
      )
      .order("starts_at", { ascending: true })
      .returns<TaskRow[]>();

    if (tasksError) {
      setWorkspaceError(tasksError.message);
      setTasks([]);
    } else {
      setTasks((taskRows || []).map(taskRowToTask));
    }

    setAuthLoading(false);
    setDataLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    const initialLoad = window.setTimeout(() => {
      void loadWorkspaceData();
    }, 0);

    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadWorkspaceData();
    });

    return () => {
      window.clearTimeout(initialLoad);
      data.subscription.unsubscribe();
    };
  }, [loadWorkspaceData, supabase]);

  useEffect(() => {
    if (!hasConfig || authLoading || currentUser) return;
    router.replace("/login");
  }, [authLoading, currentUser, hasConfig, router]);

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) || null,
    [activeTaskId, tasks],
  );

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const calendarWeeks = useMemo(() => {
    const start = startOfCalendarMonth(calendarValue);
    const end = endOfCalendarMonth(calendarValue);
    const weekCount = Math.ceil((end.diff(start, "day") + 1) / 7);

    return Array.from({ length: weekCount }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, dayIndex) =>
        start.add(weekIndex * 7 + dayIndex, "day"),
      ),
    );
  }, [calendarValue]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) =>
        taskMatchesScope(task, calendarScope, currentUserId, Boolean(canManageAccounts)),
      ),
    [calendarScope, canManageAccounts, currentUserId, tasks],
  );

  const selectedTasks = useMemo(
    () => visibleTasks.filter((task) => isTaskOnDate(task, selectedDate)),
    [selectedDate, visibleTasks],
  );

  const monthTasks = useMemo(
    () =>
      visibleTasks.filter((task) =>
        taskIntersectsRange(
          task,
          calendarValue.startOf("month"),
          calendarValue.endOf("month"),
        ),
      ),
    [calendarValue, visibleTasks],
  );

  const doneCount = monthTasks.filter((task) => task.status === "done").length;
  const completion =
    monthTasks.length === 0 ? 0 : Math.round((doneCount / monthTasks.length) * 100);
  const sentMonthCount = monthTasks.filter((task) => isSentTask(task, currentUserId)).length;
  const receivedMonthCount = monthTasks.filter((task) =>
    isReceivedTask(task, currentUserId),
  ).length;

  const openTaskModal = (date = selectedDate) => {
    if (!currentUserId) return;

    taskForm.setFieldsValue({
      range: [date.hour(9).minute(0), date.hour(18).minute(0)],
      status: "todo",
      priority: "normal",
      assigneeIds: [currentUserId],
    });
    setTaskModalOpen(true);
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUsers([]);
    setTasks([]);
    router.replace("/login");
  };

  const createTask = async (values: TaskFormValues) => {
    if (!supabase || !currentUserId) return;

    const [start, end] = values.range;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: values.title,
        description: values.description || "暂无补充说明。",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: values.status,
        priority: values.priority,
        created_by: currentUserId,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      message.error(error?.message || "创建任务失败");
      return;
    }

    const assigneeRows = values.assigneeIds.map((userId) => ({
      task_id: data.id,
      user_id: userId,
      assigned_by: currentUserId,
    }));

    const { error: assigneeError } = await supabase
      .from("task_assignees")
      .insert(assigneeRows);

    if (assigneeError) {
      message.error(assigneeError.message);
      return;
    }

    setSelectedDate(start);
    setCalendarValue(start);
    setTaskModalOpen(false);
    taskForm.resetFields();
    await loadWorkspaceData();
    message.success("任务已创建");
  };

  const createMember = async (values: MemberFormValues) => {
    const response = await fetch("/api/admin/users", {
      body: JSON.stringify({
        account: values.account,
        password: values.password,
        role: values.role,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      message.error(payload.error || "创建账号失败");
      return;
    }

    message.success("账号已创建");
    setMemberModalOpen(false);
    memberForm.resetFields();
    await loadWorkspaceData();
  };

  const deleteMember = async (userId: string) => {
    setDeletingUserId(userId);
    const response = await fetch("/api/admin/users", {
      body: JSON.stringify({ userId }),
      headers: { "Content-Type": "application/json" },
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: string };
    setDeletingUserId(null);

    if (!response.ok) {
      message.error(payload.error || "删除账号失败");
      return;
    }

    message.success("账号已删除");
    await loadWorkspaceData();
  };

  const deleteTask = async (task: CalendarTask) => {
    if (!supabase || task.createdBy !== currentUserId) return;

    setDeletingTaskId(task.id);
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id)
      .eq("created_by", currentUserId);
    setDeletingTaskId(null);

    if (error) {
      message.error(error.message);
      return;
    }

    setActiveTaskId(null);
    await loadWorkspaceData();
    message.success("任务已删除");
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    if (!supabase) return;

    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);

    if (error) {
      message.error(error.message);
      return;
    }

    await loadWorkspaceData();
    message.success("状态已更新");
  };

  const openTaskDetail = (task: CalendarTask) => {
    setActiveTaskId(task.id);
  };

  if (!hasConfig || !supabase) {
    return (
      <WorkspaceShell eyebrow="Supabase 配置" title="日历">
        <div className="setup-panel">
          <Alert
            message="缺少 Supabase 环境变量"
            description="请先在 .env.local 填入 SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY 和 SUPABASE_JWKS_URL，然后重启 pnpm dev。"
            type="warning"
            showIcon
          />
        </div>
      </WorkspaceShell>
    );
  }

  if (authLoading) {
    return (
      <WorkspaceShell eyebrow="正在连接 Supabase" title="日历">
        <div className="loading-panel">
          <Spin />
        </div>
      </WorkspaceShell>
    );
  }

  if (!currentUser) {
    return (
      <WorkspaceShell eyebrow="正在跳转登录页" title="日历">
        <div className="loading-panel">
          <Spin />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      actions={
        <Space size={12} wrap>
          <Button loading={dataLoading} onClick={loadWorkspaceData}>
            刷新
          </Button>
          {canManageAccounts ? (
            <Button icon={<UserAddOutlined />} onClick={() => setMemberModalOpen(true)}>
              账号管理
            </Button>
          ) : null}
          <Button
            icon={<PlusOutlined />}
            onClick={() => openTaskModal()}
            type="primary"
          >
            新增任务
          </Button>
          <Button onClick={signOut}>退出</Button>
          <Avatar className="profile-avatar">{initials(currentUser.name)}</Avatar>
        </Space>
      }
      title="日历"
    >
      <div className="content-grid calendar-content-grid">
        <section className="calendar-panel">
          {workspaceError ? (
            <Alert className="workspace-error" message={workspaceError} showIcon type="error" />
          ) : null}
          <div className="calendar-header">
            <Flex align="center" gap={10}>
              <Title level={4}>{calendarValue.format("YYYY年M月")}</Title>
              <Button
                icon={<LeftOutlined />}
                onClick={() => setCalendarValue((current) => current.subtract(1, "month"))}
              />
              <Button
                icon={<RightOutlined />}
                onClick={() => setCalendarValue((current) => current.add(1, "month"))}
              />
              <Button
                onClick={() => {
                  const today = dayjs();
                  setCalendarValue(today);
                  setSelectedDate(today);
                }}
              >
                今天
              </Button>
            </Flex>
            <Segmented
              onChange={(value) => setCalendarScope(value as CalendarScope)}
              options={[
                { label: "全部", value: "all" },
                { label: "我发出的", value: "sent" },
                { label: "发给我的", value: "received" },
              ]}
              value={calendarScope}
            />
          </div>

          <MonthRangeCalendar
            calendarValue={calendarValue}
            onCreateTask={openTaskModal}
            onSelectDate={setSelectedDate}
            onSelectTask={openTaskDetail}
            currentUserId={currentUserId}
            selectedDate={selectedDate}
            tasks={visibleTasks}
            weeks={calendarWeeks}
          />
        </section>

        <aside className="detail-panel">
          <div className="detail-header">
            <div>
              <Text type="secondary">{selectedDate.format("M月D日 dddd")}</Text>
              <Title level={4}>当天任务</Title>
            </div>
            <Button icon={<MoreOutlined />} onClick={() => openTaskModal(selectedDate)} />
          </div>
          <Progress percent={completion} size="small" strokeColor="#17a765" />
          <div className="summary-row">
            <span>本月任务 {monthTasks.length}</span>
            <span>已完成 {doneCount}</span>
          </div>
          <div className="relation-summary-row">
            <span>我发出 {sentMonthCount}</span>
            <span>发给我 {receivedMonthCount}</span>
          </div>
          <div className="task-detail-list">
            {selectedTasks.length === 0 ? (
              <Empty description="当天暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              selectedTasks.map((task) => (
                <TaskDetailCard
                  key={task.id}
                  currentUserId={currentUserId}
                  onOpen={openTaskDetail}
                  task={task}
                  userById={userById}
                />
              ))
            )}
          </div>
        </aside>
      </div>

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
            label="时间范围"
            name="range"
            rules={[{ message: "请选择开始和结束时间", required: true }]}
          >
            <RangePicker
              format="YYYY/MM/DD HH:mm"
              showTime={{ format: "HH:mm" }}
              style={{ width: "100%" }}
            />
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

      <TaskActionModal
        onClose={() => setActiveTaskId(null)}
        onDelete={deleteTask}
        onStatusChange={updateTaskStatus}
        currentUserId={currentUserId}
        deleting={activeTask?.id === deletingTaskId}
        task={activeTask}
        userById={userById}
      />

      <Modal
        destroyOnHidden
        okText="创建账号"
        onCancel={() => setMemberModalOpen(false)}
        onOk={() => memberForm.submit()}
        open={memberModalOpen}
        title="账号管理"
      >
        <div className="account-management-list">
          {users.map((user) => (
            <div className="account-management-row" key={user.id}>
              <Avatar style={{ backgroundColor: user.color }}>{initials(user.name)}</Avatar>
              <div>
                <div className="account-name">{user.name}</div>
              </div>
              <Tag color={user.role === "admin" ? "blue" : "default"}>
                {user.role === "admin" ? "管理员" : "员工"}
              </Tag>
              <Popconfirm
                cancelText="取消"
                description={`确定删除 ${user.name} 的账号吗？`}
                disabled={user.id === currentUserId}
                okButtonProps={{ danger: true }}
                okText="删除"
                onConfirm={() => deleteMember(user.id)}
                title="删除账号"
              >
                <Button
                  danger
                  disabled={user.id === currentUserId}
                  icon={<DeleteOutlined />}
                  loading={deletingUserId === user.id}
                  title={user.id === currentUserId ? "不能删除当前账号" : "删除账号"}
                />
              </Popconfirm>
            </div>
          ))}
        </div>
        <Form
          form={memberForm}
          initialValues={{ role: "member" }}
          layout="vertical"
          onFinish={createMember}
        >
          <Form.Item
            label="账号"
            name="account"
            rules={[
              { message: "请输入账号", required: true },
              {
                validator: async (_, value) => {
                  const error = getAccountValidationError(String(value || ""));

                  if (error) {
                    throw new Error(error);
                  }
                },
              },
            ]}
          >
            <Input placeholder="例如 张三" />
          </Form.Item>
          <Form.Item
            label="初始密码"
            name="password"
            rules={[{ message: "请输入初始密码", required: true }]}
          >
            <Input.Password placeholder="至少 6 位" />
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

function MonthRangeCalendar({
  calendarValue,
  currentUserId,
  onCreateTask,
  onSelectDate,
  onSelectTask,
  selectedDate,
  tasks,
  weeks,
}: {
  calendarValue: Dayjs;
  currentUserId: string;
  onCreateTask: (date: Dayjs) => void;
  onSelectDate: (date: Dayjs) => void;
  onSelectTask: (task: CalendarTask) => void;
  selectedDate: Dayjs;
  tasks: CalendarTask[];
  weeks: Dayjs[][];
}) {
  const visibleWeekEventCount = 2;

  return (
    <div className="range-calendar">
      <div className="range-calendar-weekdays">
        {weekdays.map((weekday) => (
          <div key={weekday}>{weekday}</div>
        ))}
      </div>
      {weeks.map((week) => {
        const weekStart = week[0];
        const weekEnd = week[6];
        const weekTasks = tasks
          .filter((task) => taskIntersectsRange(task, weekStart, weekEnd))
          .sort(
            (a, b) =>
              dayjs(a.startsAt).valueOf() - dayjs(b.startsAt).valueOf() ||
              endOfTask(b).valueOf() - endOfTask(a).valueOf(),
          );

        return (
          <div className="range-calendar-week" key={weekStart.format("YYYY-MM-DD")}>
            <div className="range-calendar-days">
              {week.map((date) => {
                const isCurrentMonth = date.month() === calendarValue.month();
                const isSelected = date.isSame(selectedDate, "day");
                const isToday = date.isSame(dayjs(), "day");

                return (
                  <button
                    className={[
                      "range-day",
                      isCurrentMonth ? "" : "is-muted",
                      isSelected ? "is-selected" : "",
                    ].join(" ")}
                    key={date.format("YYYY-MM-DD")}
                    onDoubleClick={() => onCreateTask(date)}
                    onClick={() => onSelectDate(date)}
                    type="button"
                  >
                    <span className={isToday ? "today-number" : ""}>
                      {date.date()}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="range-event-layer">
              {weekTasks.slice(0, visibleWeekEventCount).map((task, index) => {
                const segment = clampTaskToWeek(task, weekStart);
                const relation = relationForTask(task, currentUserId);
                const relationStyle = relationMeta[relation];
                const relationLabel = relationLabelForTask(task, currentUserId);
                const priority = priorityMeta[task.priority];
                const priorityColor = prioritySignalColor[task.priority];

                if (!segment) return null;

                return (
                  <button
                    className={[
                      "range-event-bar",
                      `relation-${relation}`,
                      `is-${task.status}`,
                      segment.continuesBefore ? "continues-before" : "",
                      segment.continuesAfter ? "continues-after" : "",
                    ].join(" ")}
                    key={`${weekStart.format("YYYY-MM-DD")}-${task.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectTask(task);
                    }}
                    style={{
                      "--event-color": relationStyle.color,
                      "--event-mid": relationStyle.mid,
                      "--event-soft": relationStyle.soft,
                      gridColumn: `${segment.startColumn} / span ${segment.span}`,
                      gridRow: index + 1,
                    } as CSSProperties}
                    title={`${task.title} · ${relationLabel} · 优先级${priority.label}`}
                    type="button"
                  >
                    <span
                      className="task-dot"
                      style={{
                        backgroundColor:
                          task.status === "done"
                            ? "rgba(255,255,255,0.88)"
                            : priorityColor,
                      }}
                    />
                    <span>{task.title}</span>
                  </button>
                );
              })}
            </div>
            {weekTasks.length > visibleWeekEventCount ? (
              <Text className="range-more-count" type="secondary">
                +{weekTasks.length - visibleWeekEventCount} 项
              </Text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TaskDetailCard({
  currentUserId,
  onOpen,
  task,
  userById,
}: {
  currentUserId: string;
  onOpen: (task: CalendarTask) => void;
  task: CalendarTask;
  userById: Map<string, CalendarUser>;
}) {
  const assignees = task.assigneeIds
    .map((id) => userById.get(id))
    .filter(Boolean) as CalendarUser[];
  const status = statusMeta[task.status];
  const priority = priorityMeta[task.priority];
  const creator = userById.get(task.createdBy);
  const relation = relationForTask(task, currentUserId);
  const relationStyle = relationMeta[relation];
  const relationLabel = relationLabelForTask(task, currentUserId);

  return (
    <button
      className={`task-card task-card-button relation-${relation}`}
      onClick={() => onOpen(task)}
      type="button"
    >
      <div className="task-card-top">
        <div>
          <Title level={5}>{task.title}</Title>
          <Text type="secondary">{formatTaskRange(task)}</Text>
        </div>
        <Space size={6}>
          <Tag color={relationStyle.color}>{relationLabel}</Tag>
          <Tag color={status.color}>{status.label}</Tag>
        </Space>
      </div>
      <p>{task.description}</p>
      <Progress
        percent={status.progress}
        railColor={relationStyle.trail}
        showInfo={false}
        size="small"
        strokeColor={relationStyle.color}
      />
      <div className="task-meta">
        <Tag color={priority.color}>优先级 {priority.label}</Tag>
        <Tag>发起人 {creator?.name || "未知"}</Tag>
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
    </button>
  );
}

function TaskActionModal({
  currentUserId,
  deleting,
  onDelete,
  onClose,
  onStatusChange,
  task,
  userById,
}: {
  currentUserId: string;
  deleting: boolean;
  onDelete: (task: CalendarTask) => void;
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  task: CalendarTask | null;
  userById: Map<string, CalendarUser>;
}) {
  if (!task) return null;

  const assignees = task.assigneeIds
    .map((id) => userById.get(id))
    .filter(Boolean) as CalendarUser[];
  const creator = userById.get(task.createdBy);
  const status = statusMeta[task.status];
  const priority = priorityMeta[task.priority];
  const relation = relationForTask(task, currentUserId);
  const relationStyle = relationMeta[relation];
  const relationLabel = relationLabelForTask(task, currentUserId);
  const canDelete = task.createdBy === currentUserId;

  return (
    <Modal
      footer={
        <Space wrap>
          {canDelete ? (
            <Popconfirm
              cancelText="取消"
              description="删除后无法恢复，确定删除这个任务吗？"
              okButtonProps={{ danger: true }}
              okText="删除"
              onConfirm={() => onDelete(task)}
              title="删除任务"
            >
              <Button danger icon={<DeleteOutlined />} loading={deleting}>
                删除任务
              </Button>
            </Popconfirm>
          ) : null}
          <Button onClick={() => onStatusChange(task.id, "todo")}>待处理</Button>
          <Button onClick={() => onStatusChange(task.id, "doing")} type="primary">
            开始处理
          </Button>
          <Button onClick={() => onStatusChange(task.id, "done")} type="primary">
            标记完成
          </Button>
        </Space>
      }
      onCancel={onClose}
      open
      title={task.title}
    >
      <div className="task-action-body">
        <div className="task-action-status">
          <Tag color={relationStyle.color}>{relationLabel}</Tag>
          <Tag color={status.color}>{status.label}</Tag>
          <Tag color={priority.color}>优先级 {priority.label}</Tag>
        </div>
        <div className="task-action-row">
          <Text type="secondary">时间范围</Text>
          <Text>{formatTaskRange(task)}</Text>
        </div>
        <div className="task-action-row">
          <Text type="secondary">发起人</Text>
          <Text>{creator?.name || "未知"}</Text>
        </div>
        <div className="task-action-row">
          <Text type="secondary">负责人</Text>
          <Avatar.Group max={{ count: 5 }}>
            {assignees.map((user) => (
              <Tooltip key={user.id} title={user.name}>
                <Avatar style={{ backgroundColor: user.color }}>
                  {initials(user.name)}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        </div>
        <div className="task-action-description">
          <Text type="secondary">任务说明</Text>
          <p>{task.description || "暂无补充说明。"}</p>
        </div>
      </div>
    </Modal>
  );
}
