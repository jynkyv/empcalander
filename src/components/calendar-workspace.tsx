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
  PaperClipOutlined,
  PlusOutlined,
  RightOutlined,
  SendOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  emailToAccount,
  getAccountValidationError,
  hasSupabaseConfig,
  type SupabaseBrowserConfig,
} from "@/lib/auth-config";
import { getJapanRestDay } from "@/lib/japan-holidays";
import { createClient } from "@/lib/supabase/client";
import type {
  CalendarTask,
  CalendarUser,
  TaskPriority,
  TaskAttachment,
  TaskComment,
  TaskStatus,
} from "@/lib/types";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

type CalendarScope = "all" | "sent" | "received";
type TaskRelation = "sent" | "received";

const statusMeta: Record<
  TaskStatus,
  { label: string; color: string; progress: number }
> = {
  todo: { label: "未着手", color: "#7f56d9", progress: 10 },
  doing: { label: "進行中", color: "#2f6fed", progress: 65 },
  done: { label: "完了", color: "#17a765", progress: 100 },
};

const priorityMeta: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: "低", color: "default" },
  normal: { label: "通常", color: "blue" },
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
    label: "自分が依頼",
    color: "#2f6fed",
    mid: "#dce9ff",
    soft: "#eef5ff",
    trail: "#e7eefc",
  },
  received: {
    label: "自分宛て",
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

type TaskCommentRow = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type TaskAttachmentRow = {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  oss_object_key: string | null;
  created_at: string;
};

type TaskAttachmentInput = {
  fileName: string;
  fileUrl: string;
};

function startOfCalendarMonth(month: Dayjs) {
  const firstDay = month.startOf("month");

  return firstDay.subtract(firstDay.day(), "day");
}

function endOfCalendarMonth(month: Dayjs) {
  const lastDay = month.endOf("month").startOf("day");
  const offset = 6 - lastDay.day();

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

type TaskWeekSegment = NonNullable<ReturnType<typeof clampTaskToWeek>>;

type WeekTaskLayoutItem = {
  lane: number;
  segment: TaskWeekSegment;
  task: CalendarTask;
};

function layoutWeekTasks(
  tasks: CalendarTask[],
  weekStart: Dayjs,
  laneCount: number,
) {
  const lanes: Array<Array<{ endColumn: number; startColumn: number }>> = [];
  const visible: WeekTaskLayoutItem[] = [];
  const hiddenByDay = Array.from({ length: 7 }, () => 0);

  tasks.forEach((task) => {
    const segment = clampTaskToWeek(task, weekStart);

    if (!segment) return;

    const startColumn = segment.startColumn;
    const endColumn = segment.startColumn + segment.span - 1;
    const availableLane = lanes.findIndex((ranges) =>
      ranges.every(
        (range) => endColumn < range.startColumn || startColumn > range.endColumn,
      ),
    );
    const lane = availableLane === -1 ? lanes.length : availableLane;

    if (lane < laneCount) {
      lanes[lane] = lanes[lane] || [];
      lanes[lane].push({ endColumn, startColumn });
      visible.push({ lane, segment, task });
      return;
    }

    for (let dayIndex = startColumn - 1; dayIndex < endColumn; dayIndex += 1) {
      hiddenByDay[dayIndex] += 1;
    }
  });

  return { hiddenByDay, visible };
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
    description: task.description || "補足説明はありません。",
    startsAt: task.starts_at,
    endsAt: task.ends_at || undefined,
    status: task.status,
    priority: task.priority,
    createdBy: task.created_by,
    assigneeIds: (task.task_assignees || []).map((assignee) => assignee.user_id),
  };
}

function commentRowToComment(comment: TaskCommentRow): TaskComment {
  return {
    authorId: comment.author_id,
    body: comment.body,
    createdAt: comment.created_at,
    id: comment.id,
    taskId: comment.task_id,
  };
}

function attachmentRowToAttachment(attachment: TaskAttachmentRow): TaskAttachment {
  return {
    createdAt: attachment.created_at,
    fileName: attachment.file_name,
    fileSize: attachment.file_size || undefined,
    fileUrl: attachment.file_url,
    id: attachment.id,
    mimeType: attachment.mime_type || undefined,
    ossObjectKey: attachment.oss_object_key || undefined,
    taskId: attachment.task_id,
    uploadedBy: attachment.uploaded_by || undefined,
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
  if (isReceivedTask(task, currentUserId)) return "自分宛て";
  if (isSentTask(task, currentUserId)) return "自分が依頼";
  return "他ユーザーが依頼";
}

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

function formatTaskRange(task: CalendarTask) {
  const start = dayjs(task.startsAt);
  const end = endOfTask(task);

  if (start.isSame(end, "day")) {
    return `${start.format("M月D日（ddd） HH:mm")} - ${end.format("HH:mm")}`;
  }

  return `${start.format("M月D日（ddd） HH:mm")} - ${end.format("M月D日（ddd） HH:mm")}`;
}

function formatFileSize(size?: number) {
  if (!size) return "";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
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
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [taskExtrasLoading, setTaskExtrasLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [attachmentSubmitting, setAttachmentSubmitting] = useState(false);
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
        profileError?.message ||
          "現在のアカウントに profile がありません。schema.sql が実行済みか確認してください。",
      );
      setCurrentUser(null);
      setAuthLoading(false);
      setDataLoading(false);
      return;
    }

    const currentProfile = profileToUser(profile);
    setCurrentUser(currentProfile);

    const usersResponse = await fetch("/api/users", { cache: "no-store" });
    const usersPayload = (await usersResponse.json()) as {
      error?: string;
      users?: ProfileRow[];
    };

    if (!usersResponse.ok) {
      setWorkspaceError(usersPayload.error || "アカウント一覧の読み込みに失敗しました");
      setUsers([currentProfile]);
    } else {
      const workspaceUsers = (usersPayload.users || []).map(profileToUser);
      setUsers(workspaceUsers.length > 0 ? workspaceUsers : [currentProfile]);
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
  const assigneeOptions = useMemo(
    () =>
      users.map((user) => ({
        label: user.name,
        value: user.id,
      })),
    [users],
  );

  const loadTaskExtras = useCallback(
    async (taskId: string) => {
      setTaskExtrasLoading(true);

      try {
        const [commentsResponse, attachmentsResponse] = await Promise.all([
          fetch(`/api/tasks/${taskId}/comments`, { cache: "no-store" }),
          fetch(`/api/tasks/${taskId}/attachments`, { cache: "no-store" }),
        ]);
        const commentsPayload = (await commentsResponse.json()) as {
          comments?: TaskCommentRow[];
          error?: string;
        };
        const attachmentsPayload = (await attachmentsResponse.json()) as {
          attachments?: TaskAttachmentRow[];
          error?: string;
        };

        if (!commentsResponse.ok || !attachmentsResponse.ok) {
          message.error(
            commentsPayload.error ||
              attachmentsPayload.error ||
              "タスク詳細の読み込みに失敗しました",
          );
          return;
        }

        setTaskComments((commentsPayload.comments || []).map(commentRowToComment));
        setTaskAttachments(
          (attachmentsPayload.attachments || []).map(attachmentRowToAttachment),
        );
      } catch {
        message.error("タスク詳細の読み込みに失敗しました");
      } finally {
        setTaskExtrasLoading(false);
      }
    },
    [message],
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
    const assigneeIds = Array.from(new Set(values.assigneeIds));

    if (assigneeIds.length === 0) {
      message.error("担当者を選択してください");
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: values.title,
        description: values.description || "補足説明はありません。",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: values.status,
        priority: values.priority,
        created_by: currentUserId,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      message.error(error?.message || "タスクの作成に失敗しました");
      return;
    }

    const assigneeRows = assigneeIds.map((userId) => ({
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
    message.success("タスクを作成しました");
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
      message.error(payload.error || "アカウントの作成に失敗しました");
      return;
    }

    message.success("アカウントを作成しました");
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
      message.error(payload.error || "アカウントの削除に失敗しました");
      return;
    }

    message.success("アカウントを削除しました");
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
    message.success("タスクを削除しました");
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        message.error(payload.error || "ステータスの更新に失敗しました");
        return;
      }

      await loadWorkspaceData();
      message.success("ステータスを更新しました");
    } catch {
      message.error("ステータスの更新に失敗しました");
    }
  };

  const addTaskComment = async (taskId: string, body: string) => {
    const commentBody = body.trim();

    if (!commentBody) {
      message.error("コメントを入力してください");
      return false;
    }

    setCommentSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        body: JSON.stringify({ body: commentBody }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        message.error(payload.error || "コメントの追加に失敗しました");
        return false;
      }

      await loadTaskExtras(taskId);
      message.success("コメントを追加しました");
      return true;
    } catch {
      message.error("コメントの追加に失敗しました");
      return false;
    } finally {
      setCommentSubmitting(false);
    }
  };

  const addTaskAttachment = async (
    taskId: string,
    attachment: TaskAttachmentInput,
  ) => {
    const fileName = attachment.fileName.trim();
    const fileUrl = attachment.fileUrl.trim();

    if (!fileName || !fileUrl) {
      message.error("ファイル名と URL を入力してください");
      return false;
    }

    setAttachmentSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/attachments`, {
        body: JSON.stringify({ fileName, fileUrl }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        message.error(payload.error || "添付ファイルの登録に失敗しました");
        return false;
      }

      await loadTaskExtras(taskId);
      message.success("添付ファイルを登録しました");
      return true;
    } catch {
      message.error("添付ファイルの登録に失敗しました");
      return false;
    } finally {
      setAttachmentSubmitting(false);
    }
  };

  const openTaskDetail = (task: CalendarTask) => {
    setTaskComments([]);
    setTaskAttachments([]);
    setActiveTaskId(task.id);
    void loadTaskExtras(task.id);
  };

  const closeTaskDetail = () => {
    setActiveTaskId(null);
    setTaskComments([]);
    setTaskAttachments([]);
  };

  if (!hasConfig || !supabase) {
    return (
      <WorkspaceShell eyebrow="Supabase 設定" title="カレンダー">
        <div className="setup-panel">
          <Alert
            message="Supabase 環境変数が不足しています"
            description=".env.local に SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY、SUPABASE_JWKS_URL を設定してから pnpm dev を再起動してください。"
            type="warning"
            showIcon
          />
        </div>
      </WorkspaceShell>
    );
  }

  if (authLoading) {
    return (
      <WorkspaceShell eyebrow="Supabase に接続中" title="カレンダー">
        <div className="loading-panel">
          <Spin />
        </div>
      </WorkspaceShell>
    );
  }

  if (!currentUser) {
    return (
      <WorkspaceShell eyebrow="ログインページへ移動中" title="カレンダー">
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
            更新
          </Button>
          {canManageAccounts ? (
            <Button icon={<UserAddOutlined />} onClick={() => setMemberModalOpen(true)}>
              アカウント管理
            </Button>
          ) : null}
          <Button
            icon={<PlusOutlined />}
            onClick={() => openTaskModal()}
            type="primary"
          >
            タスク作成
          </Button>
          <Button onClick={signOut}>ログアウト</Button>
          <Avatar className="profile-avatar">{initials(currentUser.name)}</Avatar>
        </Space>
      }
      title="カレンダー"
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
                今日
              </Button>
            </Flex>
            <Segmented
              onChange={(value) => setCalendarScope(value as CalendarScope)}
              options={[
                { label: "すべて", value: "all" },
                { label: "自分が依頼", value: "sent" },
                { label: "自分宛て", value: "received" },
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
              <Text type="secondary">{selectedDate.format("M月D日（dddd）")}</Text>
              <Title level={4}>当日のタスク</Title>
            </div>
            <Button icon={<MoreOutlined />} onClick={() => openTaskModal(selectedDate)} />
          </div>
          <Progress percent={completion} size="small" strokeColor="#17a765" />
          <div className="summary-row">
            <span>今月のタスク {monthTasks.length}</span>
            <span>完了 {doneCount}</span>
          </div>
          <div className="relation-summary-row">
            <span>依頼 {sentMonthCount}</span>
            <span>受信 {receivedMonthCount}</span>
          </div>
          <div className="task-detail-list">
            {selectedTasks.length === 0 ? (
              <Empty description="当日のタスクはありません" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
        okText="作成"
        onCancel={() => setTaskModalOpen(false)}
        onOk={() => taskForm.submit()}
        open={taskModalOpen}
        title="タスク作成"
      >
        <Form form={taskForm} layout="vertical" onFinish={createTask}>
          <Form.Item
            label="タスク名"
            name="title"
            rules={[{ message: "タスク名を入力してください", required: true }]}
          >
            <Input placeholder="例：会議室 PC セットアップ" />
          </Form.Item>
          <Form.Item
            label="期間"
            name="range"
            rules={[{ message: "開始日時と終了日時を選択してください", required: true }]}
          >
            <RangePicker
              format="YYYY/MM/DD HH:mm"
              showTime={{ format: "HH:mm" }}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            label="担当者"
            name="assigneeIds"
            rules={[{ message: "担当者を選択してください", required: true }]}
          >
            <Select
              maxTagCount="responsive"
              mode="multiple"
              optionFilterProp="label"
              options={assigneeOptions}
              showSearch
            />
          </Form.Item>
          <Flex gap={12}>
            <Form.Item label="ステータス" name="status" style={{ flex: 1 }}>
              <Select
                options={[
                  { label: "未着手", value: "todo" },
                  { label: "進行中", value: "doing" },
                  { label: "完了", value: "done" },
                ]}
              />
            </Form.Item>
            <Form.Item label="優先度" name="priority" style={{ flex: 1 }}>
              <Select
                options={[
                  { label: "低", value: "low" },
                  { label: "通常", value: "normal" },
                  { label: "高", value: "high" },
                ]}
              />
            </Form.Item>
          </Flex>
          <Form.Item label="説明" name="description">
            <Input.TextArea placeholder="背景、依頼内容、注意事項など" rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <TaskActionModal
        attachments={taskAttachments}
        attachmentSubmitting={attachmentSubmitting}
        comments={taskComments}
        commentSubmitting={commentSubmitting}
        key={activeTask?.id || "task-modal-closed"}
        onClose={closeTaskDetail}
        onAddAttachment={addTaskAttachment}
        onAddComment={addTaskComment}
        onDelete={deleteTask}
        onStatusChange={updateTaskStatus}
        currentUserId={currentUserId}
        deleting={activeTask?.id === deletingTaskId}
        extrasLoading={taskExtrasLoading}
        task={activeTask}
        userById={userById}
      />

      <Modal
        destroyOnHidden
        okText="作成"
        onCancel={() => setMemberModalOpen(false)}
        onOk={() => memberForm.submit()}
        open={memberModalOpen}
        title="アカウント管理"
      >
        <div className="account-management-list">
          {users.map((user) => (
            <div className="account-management-row" key={user.id}>
              <Avatar style={{ backgroundColor: user.color }}>{initials(user.name)}</Avatar>
              <div>
                <div className="account-name">{user.name}</div>
              </div>
              <Tag color={user.role === "admin" ? "blue" : "default"}>
                {user.role === "admin" ? "管理者" : "メンバー"}
              </Tag>
              <Popconfirm
                cancelText="キャンセル"
                description={`${user.name} のアカウントを削除しますか？`}
                disabled={user.id === currentUserId}
                okButtonProps={{ danger: true }}
                okText="削除"
                onConfirm={() => deleteMember(user.id)}
                title="アカウント削除"
              >
                <Button
                  danger
                  disabled={user.id === currentUserId}
                  icon={<DeleteOutlined />}
                  loading={deletingUserId === user.id}
                  title={user.id === currentUserId ? "現在のアカウントは削除できません" : "削除"}
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
            label="アカウント"
            name="account"
            rules={[
              { message: "アカウントを入力してください", required: true },
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
            <Input placeholder="例：田中" />
          </Form.Item>
          <Form.Item
            label="初期パスワード"
            name="password"
            rules={[{ message: "初期パスワードを入力してください", required: true }]}
          >
            <Input.Password placeholder="6文字以上" />
          </Form.Item>
          <Form.Item label="権限" name="role">
            <Select
              options={[
                { label: "メンバー", value: "member" },
                { label: "管理者", value: "admin" },
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
  const visibleWeekEventCount = 3;

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
        const { hiddenByDay, visible } = layoutWeekTasks(
          weekTasks,
          weekStart,
          visibleWeekEventCount,
        );

        return (
          <div className="range-calendar-week" key={weekStart.format("YYYY-MM-DD")}>
            <div className="range-calendar-days">
              {week.map((date) => {
                const isCurrentMonth = date.month() === calendarValue.month();
                const isSelected = date.isSame(selectedDate, "day");
                const isToday = date.isSame(dayjs(), "day");
                const restDay = getJapanRestDay(date.format("YYYY-MM-DD"), date.day());

                return (
                  <button
                    className={[
                      "range-day",
                      isCurrentMonth ? "" : "is-muted",
                      isSelected ? "is-selected" : "",
                      restDay.isRestDay ? "is-rest" : "",
                      restDay.isSaturday ? "is-saturday" : "",
                      restDay.isSunday ? "is-sunday" : "",
                      restDay.isHoliday ? "is-holiday" : "",
                    ].join(" ")}
                    key={date.format("YYYY-MM-DD")}
                    onDoubleClick={() => onCreateTask(date)}
                    onClick={() => onSelectDate(date)}
                    title={restDay.label || undefined}
                    type="button"
                  >
                    <span className="range-day-date">
                      <span className={isToday ? "today-number" : ""}>
                        {date.date()}
                      </span>
                      {restDay.isRestDay ? (
                        <span
                          aria-label={restDay.label || "休日"}
                          className="range-day-rest-dot"
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="range-event-layer">
              {visible.map(({ lane, segment, task }) => {
                const relation = relationForTask(task, currentUserId);
                const relationStyle = relationMeta[relation];
                const relationLabel = relationLabelForTask(task, currentUserId);
                const priority = priorityMeta[task.priority];
                const priorityColor = prioritySignalColor[task.priority];

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
                      gridRow: lane + 1,
                    } as CSSProperties}
                    title={`${task.title} · ${relationLabel} · 優先度${priority.label}`}
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
            <div className="range-more-layer">
              {hiddenByDay.map((count, dayIndex) =>
                count > 0 ? (
                  <Text
                    className="range-more-count"
                    key={`${weekStart.format("YYYY-MM-DD")}-${dayIndex}`}
                    style={{ gridColumn: dayIndex + 1 }}
                    type="secondary"
                  >
                    +{count}件
                  </Text>
                ) : (
                  <span
                    aria-hidden="true"
                    key={`${weekStart.format("YYYY-MM-DD")}-${dayIndex}`}
                  />
                ),
              )}
            </div>
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
        <Tag color={priority.color}>優先度 {priority.label}</Tag>
        <Tag>依頼者 {creator?.name || "不明"}</Tag>
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
  attachments,
  attachmentSubmitting,
  comments,
  commentSubmitting,
  currentUserId,
  deleting,
  extrasLoading,
  onAddAttachment,
  onAddComment,
  onDelete,
  onClose,
  onStatusChange,
  task,
  userById,
}: {
  attachments: TaskAttachment[];
  attachmentSubmitting: boolean;
  comments: TaskComment[];
  commentSubmitting: boolean;
  currentUserId: string;
  deleting: boolean;
  extrasLoading: boolean;
  onAddAttachment: (
    taskId: string,
    attachment: TaskAttachmentInput,
  ) => Promise<boolean>;
  onAddComment: (taskId: string, body: string) => Promise<boolean>;
  onDelete: (task: CalendarTask) => void;
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
  task: CalendarTask | null;
  userById: Map<string, CalendarUser>;
}) {
  const [commentBody, setCommentBody] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

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
  const submitComment = async () => {
    const created = await onAddComment(task.id, commentBody);

    if (created) {
      setCommentBody("");
    }
  };
  const submitAttachment = async () => {
    const created = await onAddAttachment(task.id, {
      fileName: attachmentName,
      fileUrl: attachmentUrl,
    });

    if (created) {
      setAttachmentName("");
      setAttachmentUrl("");
    }
  };

  return (
    <Modal
      footer={
        <Space wrap>
          {canDelete ? (
            <Popconfirm
              cancelText="キャンセル"
              description="削除後は復元できません。このタスクを削除しますか？"
              okButtonProps={{ danger: true }}
              okText="削除"
              onConfirm={() => onDelete(task)}
              title="タスク削除"
            >
              <Button danger icon={<DeleteOutlined />} loading={deleting}>
                タスク削除
              </Button>
            </Popconfirm>
          ) : null}
          <Button onClick={() => onStatusChange(task.id, "todo")}>未着手</Button>
          <Button onClick={() => onStatusChange(task.id, "doing")} type="primary">
            進行中にする
          </Button>
          <Button onClick={() => onStatusChange(task.id, "done")} type="primary">
            完了にする
          </Button>
        </Space>
      }
      onCancel={onClose}
      open
      title={task.title}
      width={720}
    >
      <div className="task-action-body">
        <div className="task-action-status">
          <Tag color={relationStyle.color}>{relationLabel}</Tag>
          <Tag color={status.color}>{status.label}</Tag>
          <Tag color={priority.color}>優先度 {priority.label}</Tag>
        </div>
        <div className="task-action-row">
          <Text type="secondary">期間</Text>
          <Text>{formatTaskRange(task)}</Text>
        </div>
        <div className="task-action-row">
          <Text type="secondary">依頼者</Text>
          <Text>{creator?.name || "不明"}</Text>
        </div>
        <div className="task-action-row">
          <Text type="secondary">担当者</Text>
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
          <Text type="secondary">説明</Text>
          <p>{task.description || "補足説明はありません。"}</p>
        </div>
        <div className="task-action-section">
          <div className="task-action-section-header">
            <Text strong>コメント</Text>
            {extrasLoading ? <Spin size="small" /> : null}
          </div>
          <div className="task-comment-list">
            {comments.length === 0 ? (
              <Text type="secondary">コメントはまだありません。</Text>
            ) : (
              comments.map((comment) => {
                const author = userById.get(comment.authorId);

                return (
                  <div className="task-comment-item" key={comment.id}>
                    <Avatar style={{ backgroundColor: author?.color || "#8a94a6" }}>
                      {initials(author?.name || "?")}
                    </Avatar>
                    <div>
                      <div className="task-comment-meta">
                        <Text strong>{author?.name || "不明"}</Text>
                        <Text type="secondary">
                          {dayjs(comment.createdAt).format("M月D日 HH:mm")}
                        </Text>
                      </div>
                      <p>{comment.body}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Input.TextArea
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder="コメントを入力"
            rows={3}
            value={commentBody}
          />
          <Button
            icon={<SendOutlined />}
            loading={commentSubmitting}
            onClick={submitComment}
            type="primary"
          >
            コメント追加
          </Button>
        </div>
        <div className="task-action-section">
          <div className="task-action-section-header">
            <Text strong>添付ファイル</Text>
            {extrasLoading ? <Spin size="small" /> : null}
          </div>
          <div className="task-attachment-list">
            {attachments.length === 0 ? (
              <Text type="secondary">添付ファイルはまだありません。</Text>
            ) : (
              attachments.map((attachment) => {
                const uploader = attachment.uploadedBy
                  ? userById.get(attachment.uploadedBy)
                  : null;
                const sizeLabel = formatFileSize(attachment.fileSize);

                return (
                  <a
                    className="task-attachment-item"
                    href={attachment.fileUrl}
                    key={attachment.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <PaperClipOutlined />
                    <span>{attachment.fileName}</span>
                    <Text type="secondary">
                      {[
                        sizeLabel,
                        uploader?.name,
                        dayjs(attachment.createdAt).format("M月D日 HH:mm"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </a>
                );
              })
            )}
          </div>
          <div className="task-attachment-form">
            <Input
              onChange={(event) => setAttachmentName(event.target.value)}
              placeholder="ファイル名"
              value={attachmentName}
            />
            <Input
              onChange={(event) => setAttachmentUrl(event.target.value)}
              placeholder="OSS URL"
              value={attachmentUrl}
            />
            <Button
              icon={<PaperClipOutlined />}
              loading={attachmentSubmitting}
              onClick={submitAttachment}
            >
              添付登録
            </Button>
          </div>
          <Text type="secondary">
            Aliyun OSS のアップロード連携後は、この添付登録に接続します。
          </Text>
        </div>
      </div>
    </Modal>
  );
}
