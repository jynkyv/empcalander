"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  Avatar,
  Button,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
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
  LeftOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import { demoTasks, demoUsers } from "@/lib/demo-data";
import type {
  CalendarTask,
  CalendarUser,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const currentUserId = "u-admin";
const currentUserRole: CalendarUser["role"] = "admin";

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
  name: string;
  email: string;
  role: "admin" | "member";
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

function isSentTask(task: CalendarTask) {
  return task.createdBy === currentUserId;
}

function isReceivedTask(task: CalendarTask) {
  return task.createdBy !== currentUserId && task.assigneeIds.includes(currentUserId);
}

function taskMatchesScope(task: CalendarTask, scope: CalendarScope) {
  if (scope === "sent") return isSentTask(task);
  if (scope === "received") return isReceivedTask(task);

  return isSentTask(task) || isReceivedTask(task);
}

function relationForTask(task: CalendarTask): TaskRelation {
  return isReceivedTask(task) ? "received" : "sent";
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

export function CalendarWorkspace() {
  const [users, setUsers] = useState<CalendarUser[]>(demoUsers);
  const [tasks, setTasks] = useState<CalendarTask[]>(demoTasks);
  const [calendarValue, setCalendarValue] = useState<Dayjs>(dayjs("2026-07-02"));
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs("2026-07-02"));
  const [calendarScope, setCalendarScope] = useState<CalendarScope>("all");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskForm] = Form.useForm<TaskFormValues>();
  const [memberForm] = Form.useForm<MemberFormValues>();

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
    () => tasks.filter((task) => taskMatchesScope(task, calendarScope)),
    [calendarScope, tasks],
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
  const sentMonthCount = monthTasks.filter(isSentTask).length;
  const receivedMonthCount = monthTasks.filter(isReceivedTask).length;
  const canManageAccounts = currentUserRole === "admin";

  const openTaskModal = (date = selectedDate) => {
    taskForm.setFieldsValue({
      range: [date.hour(9).minute(0), date.hour(18).minute(0)],
      status: "todo",
      priority: "normal",
      assigneeIds: [currentUserId],
    });
    setTaskModalOpen(true);
  };

  const createTask = (values: TaskFormValues) => {
    const [start, end] = values.range;
    const nextTask: CalendarTask = {
      id: `task-${Date.now()}`,
      title: values.title,
      description: values.description || "暂无补充说明。",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      status: values.status,
      priority: values.priority,
      createdBy: currentUserId,
      assigneeIds: values.assigneeIds,
    };

    setTasks((current) => [...current, nextTask]);
    setSelectedDate(start);
    setCalendarValue(start);
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
    setMemberModalOpen(false);
    memberForm.resetFields();
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    );
  };

  const openTaskDetail = (task: CalendarTask) => {
    setActiveTaskId(task.id);
  };

  return (
    <WorkspaceShell
      actions={
        <Space size={12} wrap>
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
          <Avatar className="profile-avatar">{initials("田中太郎")}</Avatar>
        </Space>
      }
      title="日历"
    >
      <div className="content-grid calendar-content-grid">
        <section className="calendar-panel">
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
        onStatusChange={updateTaskStatus}
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
                <Text type="secondary">{user.email}</Text>
              </div>
              <Tag color={user.role === "admin" ? "blue" : "default"}>
                {user.role === "admin" ? "管理员" : "员工"}
              </Tag>
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
    </WorkspaceShell>
  );
}

function MonthRangeCalendar({
  calendarValue,
  onCreateTask,
  onSelectDate,
  onSelectTask,
  selectedDate,
  tasks,
  weeks,
}: {
  calendarValue: Dayjs;
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
                const relation = relationForTask(task);
                const relationStyle = relationMeta[relation];

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
                    title={task.title}
                    type="button"
                  >
                    <span
                      className="task-dot"
                      style={{
                        backgroundColor:
                          task.status === "done"
                            ? "rgba(255,255,255,0.88)"
                            : relationStyle.color,
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
  onOpen,
  task,
  userById,
}: {
  onOpen: (task: CalendarTask) => void;
  task: CalendarTask;
  userById: Map<string, CalendarUser>;
}) {
  const assignees = task.assigneeIds
    .map((id) => userById.get(id))
    .filter(Boolean) as CalendarUser[];
  const status = statusMeta[task.status];
  const priority = priorityMeta[task.priority];
  const relation = relationForTask(task);
  const relationStyle = relationMeta[relation];

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
          <Tag color={relationStyle.color}>{relationStyle.label}</Tag>
          <Tag color={status.color}>{status.label}</Tag>
        </Space>
      </div>
      <p>{task.description}</p>
      <Progress
        percent={status.progress}
        showInfo={false}
        size="small"
        strokeColor={relationStyle.color}
        trailColor={relationStyle.trail}
      />
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
    </button>
  );
}

function TaskActionModal({
  onClose,
  onStatusChange,
  task,
  userById,
}: {
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  task: CalendarTask | null;
  userById: Map<string, CalendarUser>;
}) {
  if (!task) return null;

  const assignees = task.assigneeIds
    .map((id) => userById.get(id))
    .filter(Boolean) as CalendarUser[];
  const status = statusMeta[task.status];
  const priority = priorityMeta[task.priority];
  const relation = relationForTask(task);
  const relationStyle = relationMeta[relation];

  return (
    <Modal
      footer={
        <Space wrap>
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
          <Tag color={relationStyle.color}>{relationStyle.label}</Tag>
          <Tag color={status.color}>{status.label}</Tag>
          <Tag color={priority.color}>优先级 {priority.label}</Tag>
        </div>
        <div className="task-action-row">
          <Text type="secondary">时间范围</Text>
          <Text>{formatTaskRange(task)}</Text>
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
