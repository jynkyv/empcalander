"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  App,
  Avatar,
  Badge,
  Button,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import type { UploadProps } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import {
  BellOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  LeftOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RightOutlined,
  SendOutlined,
  UploadOutlined,
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

dayjs.locale("ja");

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

type CalendarScope = "all" | "sent" | "received";
type CalendarStatusFilter = "all" | TaskStatus;
type TaskRelation = "sent" | "received";
type RawTaskStatus = TaskStatus | "doing";

const statusMeta: Record<
  TaskStatus,
  { label: string; color: string }
> = {
  todo: { label: "未処理", color: "#7f56d9" },
  done: { label: "完了", color: "#17a765" },
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

const taskColorPalette = [
  { color: "#2f6fed", mid: "#dce9ff", soft: "#eef5ff" },
  { color: "#17a765", mid: "#dff6e9", soft: "#f0fbf5" },
  { color: "#e5484d", mid: "#ffe1e3", soft: "#fff3f3" },
  { color: "#7f56d9", mid: "#eadfff", soft: "#f7f2ff" },
  { color: "#0891b2", mid: "#d7f4fb", soft: "#effbfe" },
  { color: "#dc6803", mid: "#fde7c8", soft: "#fff7ed" },
  { color: "#0f766e", mid: "#ccfbf1", soft: "#effdfa" },
  { color: "#c026d3", mid: "#f5d0fe", soft: "#fdf4ff" },
];

const relationMeta: Record<
  TaskRelation,
  { label: string; color: string; mid: string; soft: string }
> = {
  sent: {
    label: "自分が依頼",
    color: "#2f6fed",
    mid: "#dce9ff",
    soft: "#eef5ff",
  },
  received: {
    label: "自分宛て",
    color: "#f59e0b",
    mid: "#ffedc2",
    soft: "#fff7e6",
  },
};

type TaskFormValues = {
  title: string;
  range: [Dayjs, Dayjs];
  assigneeIds: string[];
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
  status: RawTaskStatus;
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
  comment_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  oss_object_key: string | null;
  upload_status: "pending" | "uploaded";
  created_at: string;
};

type TaskAttachmentSummaryRow = {
  file_name: string;
  task_id: string;
};

type TaskAttachmentSummary = {
  count: number;
  fileNames: string[];
};

type TaskNotificationType = "assigned" | "comment" | "done";

type TaskNotification = {
  actorColor: string;
  actorId?: string;
  actorName: string;
  commentId?: string;
  createdAt: string;
  id: string;
  readAt?: string | null;
  taskId: string;
  taskTitle: string;
  type: TaskNotificationType;
};

type NotificationsPayload = {
  error?: string;
  notifications?: TaskNotification[];
};

type CommentAttachmentDraft = {
  file: File;
  fileSize?: number;
  fileName: string;
  mimeType?: string;
  uid: string;
};

type AttachmentPreviewMode =
  | "audio"
  | "image"
  | "inline"
  | "office"
  | "unsupported"
  | "video";

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

function taskColor(task: CalendarTask) {
  const source = task.id || task.title;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return taskColorPalette[hash % taskColorPalette.length];
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
    status: task.status === "done" ? "done" : "todo",
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
    commentId: attachment.comment_id,
    createdAt: attachment.created_at,
    fileName: attachment.file_name,
    fileSize: attachment.file_size || undefined,
    fileUrl: attachment.file_url || undefined,
    id: attachment.id,
    mimeType: attachment.mime_type || undefined,
    ossObjectKey: attachment.oss_object_key || undefined,
    taskId: attachment.task_id,
    uploadedBy: attachment.uploaded_by || undefined,
    uploadStatus: attachment.upload_status,
  };
}

function buildTaskAttachmentSummary(rows: TaskAttachmentSummaryRow[]) {
  return rows.reduce<Record<string, TaskAttachmentSummary>>((summary, row) => {
    const current = summary[row.task_id] || { count: 0, fileNames: [] };

    summary[row.task_id] = {
      count: current.count + 1,
      fileNames:
        current.fileNames.length >= 2
          ? current.fileNames
          : [...current.fileNames, row.file_name],
    };

    return summary;
  }, {});
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

function attachmentExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");

  return parts.length > 1 ? parts.at(-1) || "" : "";
}

function attachmentPreviewMode(attachment: TaskAttachment): AttachmentPreviewMode {
  const mimeType = (attachment.mimeType || "").toLowerCase();
  const extension = attachmentExtension(attachment.fileName);

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/pdf" ||
    ["csv", "json", "log", "md", "pdf", "txt"].includes(extension)
  ) {
    return "inline";
  }

  if (
    ["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(extension) ||
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("spreadsheetml") ||
    mimeType.includes("presentationml") ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.ms-powerpoint"
  ) {
    return "office";
  }

  return "unsupported";
}

function fileToAttachmentDraft(file: File) {
  const uploadFile = file as File & { uid?: string };

  return {
    file,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || undefined,
    uid:
      uploadFile.uid ||
      `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
  } satisfies CommentAttachmentDraft;
}

function buildCommentFormData(
  body: string,
  attachments: CommentAttachmentDraft[],
) {
  const formData = new FormData();

  formData.append("body", body);
  attachments.forEach((attachment) => {
    formData.append("attachments", attachment.file, attachment.fileName);
  });

  return formData;
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
  const [taskAttachmentSummary, setTaskAttachmentSummary] = useState<
    Record<string, TaskAttachmentSummary>
  >({});
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [calendarValue, setCalendarValue] = useState<Dayjs>(dayjs());
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [calendarScope, setCalendarScope] = useState<CalendarScope>("all");
  const [calendarStatusFilter, setCalendarStatusFilter] =
    useState<CalendarStatusFilter>("all");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskDraftAttachments, setTaskDraftAttachments] = useState<
    CommentAttachmentDraft[]
  >([]);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [taskExtrasLoading, setTaskExtrasLoading] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<{
    status: TaskStatus;
    taskId: string;
  } | null>(null);
  const [taskForm] = Form.useForm<TaskFormValues>();
  const [memberForm] = Form.useForm<MemberFormValues>();
  const workspaceLoadIdRef = useRef(0);
  const taskExtrasLoadIdRef = useRef(0);

  const currentUserId = currentUser?.id || "";
  const canManageAccounts = currentUser?.role === "admin";

  const fetchNotifications = useCallback(async () => {
    const response = await fetch(`/api/notifications?ts=${Date.now()}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as NotificationsPayload;

    if (!response.ok) {
      throw new Error(payload.error || "通知の読み込みに失敗しました");
    }

    return payload.notifications || [];
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifications(await fetchNotifications());
  }, [fetchNotifications]);

  const loadWorkspaceData = useCallback(async () => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    const requestId = workspaceLoadIdRef.current + 1;
    workspaceLoadIdRef.current = requestId;
    const isCurrentRequest = () => workspaceLoadIdRef.current === requestId;

    setDataLoading(true);
    setWorkspaceError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (!isCurrentRequest()) return;

      const authUser = authData.user;

      if (authError || !authUser) {
        setCurrentUser(null);
        setUsers([]);
        setTasks([]);
        setTaskAttachmentSummary({});
        setNotifications([]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,color")
        .eq("id", authUser.id)
        .maybeSingle<ProfileRow>();

      if (!isCurrentRequest()) return;

      if (profileError || !profile) {
        setWorkspaceError(
          profileError?.message ||
            "現在のアカウントに profile がありません。schema.sql が実行済みか確認してください。",
        );
        setCurrentUser(null);
        setUsers([]);
        setTasks([]);
        setTaskAttachmentSummary({});
        setNotifications([]);
        return;
      }

      const currentProfile = profileToUser(profile);
      setCurrentUser(currentProfile);

      const usersResponse = await fetch("/api/users", { cache: "no-store" });
      const usersPayload = (await usersResponse.json()) as {
        error?: string;
        users?: ProfileRow[];
      };

      if (!isCurrentRequest()) return;

      if (!usersResponse.ok) {
        setWorkspaceError(usersPayload.error || "アカウント一覧の読み込みに失敗しました");
        setUsers([currentProfile]);
      } else {
        const workspaceUsers = (usersPayload.users || []).map(profileToUser);
        setUsers(workspaceUsers.length > 0 ? workspaceUsers : [currentProfile]);
      }

      const tasksResponse = await fetch("/api/tasks", { cache: "no-store" });
      const tasksPayload = (await tasksResponse.json()) as {
        error?: string;
        tasks?: TaskRow[];
      };

      if (!isCurrentRequest()) return;

      if (!tasksResponse.ok) {
        setWorkspaceError(tasksPayload.error || "タスク一覧の読み込みに失敗しました");
        setTasks([]);
        setTaskAttachmentSummary({});
      } else {
        setTasks((tasksPayload.tasks || []).map(taskRowToTask));

        const { data: attachmentRows } = await supabase
          .from("task_attachments")
          .select("task_id,file_name")
          .order("created_at", { ascending: true })
          .returns<TaskAttachmentSummaryRow[]>();

        if (!isCurrentRequest()) return;

        setTaskAttachmentSummary(buildTaskAttachmentSummary(attachmentRows || []));
      }

      try {
        const nextNotifications = await fetchNotifications();

        if (!isCurrentRequest()) return;

        setNotifications(nextNotifications);
      } catch {
        // Notification fetch is non-blocking for the calendar itself.
      }
    } catch (error) {
      if (!isCurrentRequest()) return;

      setWorkspaceError(
        error instanceof Error ? error.message : "データの読み込みに失敗しました",
      );
    } finally {
      if (isCurrentRequest()) {
        setAuthLoading(false);
        setDataLoading(false);
      }
    }
  }, [fetchNotifications, supabase]);

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
      workspaceLoadIdRef.current += 1;
      taskExtrasLoadIdRef.current += 1;
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
      const requestId = taskExtrasLoadIdRef.current + 1;
      taskExtrasLoadIdRef.current = requestId;
      const isCurrentRequest = () => taskExtrasLoadIdRef.current === requestId;

      setTaskExtrasLoading(true);

      try {
        const [commentsResponse, attachmentsResponse] = await Promise.all([
          fetch(`/api/tasks/${taskId}/comments`, { cache: "no-store" }),
          fetch(`/api/tasks/${taskId}/attachments`, { cache: "no-store" }),
        ]);

        if (!isCurrentRequest()) return;

        const commentsPayload = (await commentsResponse.json()) as {
          comments?: TaskCommentRow[];
          error?: string;
        };
        const attachmentsPayload = (await attachmentsResponse.json()) as {
          attachments?: TaskAttachmentRow[];
          error?: string;
        };

        if (!isCurrentRequest()) return;

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
        if (isCurrentRequest()) {
          message.error("タスク詳細の読み込みに失敗しました");
        }
      } finally {
        if (isCurrentRequest()) {
          setTaskExtrasLoading(false);
        }
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
      tasks.filter(
        (task) =>
          taskMatchesScope(
            task,
            calendarScope,
            currentUserId,
            Boolean(canManageAccounts),
          ) &&
          (calendarStatusFilter === "all" || task.status === calendarStatusFilter),
      ),
    [calendarScope, calendarStatusFilter, canManageAccounts, currentUserId, tasks],
  );
  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.readAt),
    [notifications],
  );
  const unreadCountByTaskId = useMemo(
    () =>
      unreadNotifications.reduce<Record<string, number>>((counts, notification) => {
        counts[notification.taskId] = (counts[notification.taskId] || 0) + 1;

        return counts;
      }, {}),
    [unreadNotifications],
  );

  const selectedTasks = useMemo(
    () => visibleTasks.filter((task) => isTaskOnDate(task, selectedDate)),
    [selectedDate, visibleTasks],
  );

  const selectedTodoCount = selectedTasks.filter((task) => task.status === "todo").length;
  const selectedDoneCount = selectedTasks.filter((task) => task.status === "done").length;
  const selectedCompletion =
    selectedTasks.length === 0
      ? 0
      : Math.round((selectedDoneCount / selectedTasks.length) * 100);
  const selectedSentCount = selectedTasks.filter((task) =>
    isSentTask(task, currentUserId),
  ).length;
  const selectedReceivedCount = selectedTasks.filter((task) =>
    isReceivedTask(task, currentUserId),
  ).length;

  const openTaskModal = (date = selectedDate) => {
    if (!currentUserId) return;

    setTaskDraftAttachments([]);
    taskForm.setFieldsValue({
      range: [date.hour(9).minute(0), date.hour(18).minute(0)],
      priority: "normal",
      assigneeIds: [currentUserId],
    });
    setTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    if (taskSubmitting) return;

    setTaskModalOpen(false);
    setTaskDraftAttachments([]);
  };

  const signOut = async () => {
    if (!supabase || signingOut) return;

    setSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setCurrentUser(null);
      setUsers([]);
      setTasks([]);
      setTaskAttachmentSummary({});
      setNotifications([]);
      router.replace("/login");
    } catch {
      message.error("ログアウトに失敗しました");
      setSigningOut(false);
    }
  };

  const createTask = async (values: TaskFormValues) => {
    if (!currentUserId || taskSubmitting) return;

    const [start, end] = values.range;
    const assigneeIds = Array.from(new Set(values.assigneeIds));

    if (assigneeIds.length === 0) {
      message.error("担当者を選択してください");
      return;
    }

    setTaskSubmitting(true);

    try {
      const response = await fetch("/api/tasks", {
        body: JSON.stringify({
          assigneeIds,
          description: values.description,
          endsAt: end.toISOString(),
          priority: values.priority,
          startsAt: start.toISOString(),
          title: values.title,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        task?: { id: string };
      };

      if (!response.ok || !payload.task) {
        message.error(payload.error || "タスクの作成に失敗しました");
        return;
      }

      const attachmentsUploaded =
        taskDraftAttachments.length === 0 ||
        (await addTaskComment(payload.task.id, "", taskDraftAttachments, {
          refresh: false,
          successMessage: false,
        }));

      setSelectedDate(start);
      setCalendarValue(start);
      setTaskModalOpen(false);
      setTaskDraftAttachments([]);
      taskForm.resetFields();
      await loadWorkspaceData();
      message.success(
        attachmentsUploaded
          ? "タスクを作成しました"
          : "タスクを作成しました。添付ファイルは再度アップロードしてください",
      );
    } catch {
      message.error("タスクの作成に失敗しました");
    } finally {
      setTaskSubmitting(false);
    }
  };

  const createMember = async (values: MemberFormValues) => {
    if (memberSubmitting) return;

    setMemberSubmitting(true);

    try {
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
    } catch {
      message.error("アカウントの作成に失敗しました");
    } finally {
      setMemberSubmitting(false);
    }
  };

  const deleteMember = async (userId: string) => {
    if (deletingUserId) return;

    setDeletingUserId(userId);

    try {
      const response = await fetch("/api/admin/users", {
        body: JSON.stringify({ userId }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        message.error(payload.error || "アカウントの削除に失敗しました");
        return;
      }

      message.success("アカウントを削除しました");
      await loadWorkspaceData();
    } catch {
      message.error("アカウントの削除に失敗しました");
    } finally {
      setDeletingUserId(null);
    }
  };

  const deleteTask = async (task: CalendarTask) => {
    if (!supabase || task.createdBy !== currentUserId || deletingTaskId) return;

    setDeletingTaskId(task.id);

    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", task.id)
        .eq("created_by", currentUserId);

      if (error) {
        message.error(error.message);
        return;
      }

      setActiveTaskId(null);
      await loadWorkspaceData();
      message.success("タスクを削除しました");
    } catch {
      message.error("タスクの削除に失敗しました");
    } finally {
      setDeletingTaskId(null);
    }
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    if (statusUpdating) return;

    setStatusUpdating({ status, taskId });

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
    } finally {
      setStatusUpdating(null);
    }
  };

  const addTaskComment = async (
    taskId: string,
    body: string,
    attachments: CommentAttachmentDraft[],
    options: { refresh?: boolean; successMessage?: false | string } = {},
  ) => {
    const commentBody = body.trim();

    if (!commentBody && attachments.length === 0) {
      message.error("コメントまたは添付ファイルを入力してください");
      return false;
    }

    setCommentSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        body: buildCommentFormData(commentBody, attachments),
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        message.error(payload.error || "コメントの追加に失敗しました");
        return false;
      }

      if (options.refresh !== false) {
        await loadTaskExtras(taskId);
      }

      if (options.successMessage !== false) {
        message.success(options.successMessage || "コメントを追加しました");
      }

      return true;
    } catch {
      message.error("コメントの追加に失敗しました");
      return false;
    } finally {
      setCommentSubmitting(false);
    }
  };

  const markTaskNotificationsRead = async (taskId: string) => {
    if (!unreadCountByTaskId[taskId]) return;

    const fallbackReadAt = new Date().toISOString();

    setNotifications((current) =>
      current.map((notification) =>
        notification.taskId === taskId && !notification.readAt
          ? { ...notification, readAt: fallbackReadAt }
          : notification,
      ),
    );

    try {
      const response = await fetch(`/api/tasks/${taskId}/notifications/read`, {
        method: "PATCH",
      });

      if (!response.ok) {
        void loadWorkspaceData();
        return;
      }

      void loadNotifications().catch(() => {
        void loadWorkspaceData();
      });
    } catch {
      void loadWorkspaceData();
    }
  };

  const openTaskDetail = (task: CalendarTask) => {
    setTaskComments([]);
    setTaskAttachments([]);
    setActiveTaskId(task.id);
    void loadTaskExtras(task.id);
    void markTaskNotificationsRead(task.id);
  };

  const closeTaskDetail = () => {
    taskExtrasLoadIdRef.current += 1;
    setTaskExtrasLoading(false);
    setActiveTaskId(null);
    setTaskComments([]);
    setTaskAttachments([]);
  };

  const openNotificationTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);

    if (task) {
      openTaskDetail(task);
    }
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
          <Popover
            content={
              <NotificationPanel
                notifications={notifications}
                onOpenTask={openNotificationTask}
                unreadCount={unreadNotifications.length}
              />
            }
            placement="bottomRight"
            trigger="click"
          >
            <Badge count={unreadNotifications.length} size="small">
              <Button icon={<BellOutlined />}>通知</Button>
            </Badge>
          </Popover>
          {canManageAccounts ? (
            <Button icon={<UserAddOutlined />} onClick={() => setMemberModalOpen(true)}>
              アカウント管理
            </Button>
          ) : null}
          <Button
            disabled={taskSubmitting}
            icon={<PlusOutlined />}
            onClick={() => openTaskModal()}
            type="primary"
          >
            タスク作成
          </Button>
          <Button loading={signingOut} onClick={signOut}>
            ログアウト
          </Button>
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
            <Space size={8} wrap>
              <Segmented
                onChange={(value) => setCalendarScope(value as CalendarScope)}
                options={[
                  { label: "すべて", value: "all" },
                  { label: "自分が依頼", value: "sent" },
                  { label: "自分宛て", value: "received" },
                ]}
                value={calendarScope}
              />
              <Segmented
                onChange={(value) =>
                  setCalendarStatusFilter(value as CalendarStatusFilter)
                }
                options={[
                  { label: "すべて", value: "all" },
                  { label: "未処理", value: "todo" },
                  { label: "完了", value: "done" },
                ]}
                value={calendarStatusFilter}
              />
            </Space>
          </div>

          <MonthRangeCalendar
            calendarValue={calendarValue}
            onCreateTask={openTaskModal}
            onSelectDate={setSelectedDate}
            onSelectTask={openTaskDetail}
            currentUserId={currentUserId}
            selectedDate={selectedDate}
            tasks={visibleTasks}
            unreadCountByTaskId={unreadCountByTaskId}
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
          <Progress percent={selectedCompletion} size="small" strokeColor="#17a765" />
          <div className="summary-row">
            <span>当日のタスク {selectedTasks.length}</span>
            <span>未処理 {selectedTodoCount}</span>
            <span>完了 {selectedDoneCount}</span>
          </div>
          <div className="relation-summary-row">
            <span>依頼 {selectedSentCount}</span>
            <span>受信 {selectedReceivedCount}</span>
          </div>
          <div className="task-detail-list">
            {selectedTasks.length === 0 ? (
              <Empty description="当日のタスクはありません" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              selectedTasks.map((task) => (
                <TaskDetailCard
                  attachmentSummary={taskAttachmentSummary[task.id]}
                  key={task.id}
                  currentUserId={currentUserId}
                  onOpen={openTaskDetail}
                  task={task}
                  unreadCount={unreadCountByTaskId[task.id] || 0}
                  userById={userById}
                />
              ))
            )}
          </div>
        </aside>
      </div>

      <Modal
        cancelButtonProps={{ disabled: taskSubmitting }}
        confirmLoading={taskSubmitting}
        destroyOnHidden
        okText="作成"
        onCancel={closeTaskModal}
        onOk={() => taskForm.submit()}
        open={taskModalOpen}
        title="タスク作成"
      >
        <Form
          disabled={taskSubmitting}
          form={taskForm}
          layout="vertical"
          onFinish={createTask}
        >
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
          <Form.Item label="優先度" name="priority">
            <Select
              options={[
                { label: "低", value: "low" },
                { label: "通常", value: "normal" },
                { label: "高", value: "high" },
              ]}
            />
          </Form.Item>
          <Form.Item label="説明" name="description">
            <Input.TextArea placeholder="背景、依頼内容、注意事項など" rows={4} />
          </Form.Item>
          <div className="task-create-attachments">
            <Text strong>添付ファイル</Text>
            <Upload
              beforeUpload={(file) => {
                setTaskDraftAttachments((current) => [
                  ...current,
                  fileToAttachmentDraft(file),
                ]);

                return false;
              }}
              disabled={taskSubmitting}
              fileList={[]}
              multiple
              showUploadList={false}
            >
              <Button disabled={taskSubmitting} icon={<UploadOutlined />}>
                アップロード
              </Button>
            </Upload>
            <PendingAttachmentList
              attachments={taskDraftAttachments}
              disabled={taskSubmitting}
              onRemove={(uid) =>
                setTaskDraftAttachments((current) =>
                  current.filter((attachment) => attachment.uid !== uid),
                )
              }
            />
          </div>
        </Form>
      </Modal>

      <TaskActionModal
        attachments={taskAttachments}
        comments={taskComments}
        commentSubmitting={commentSubmitting}
        key={activeTask?.id || "task-modal-closed"}
        onClose={closeTaskDetail}
        onAddComment={addTaskComment}
        onDelete={deleteTask}
        onStatusChange={updateTaskStatus}
        currentUserId={currentUserId}
        deleting={activeTask?.id === deletingTaskId}
        extrasLoading={taskExtrasLoading}
        statusUpdating={
          statusUpdating && activeTask?.id === statusUpdating.taskId
            ? statusUpdating.status
            : null
        }
        task={activeTask}
        userById={userById}
      />

      <Modal
        cancelButtonProps={{ disabled: memberSubmitting }}
        confirmLoading={memberSubmitting}
        destroyOnHidden
        okText="作成"
        onCancel={() => {
          if (!memberSubmitting) {
            setMemberModalOpen(false);
          }
        }}
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
                okButtonProps={{
                  danger: true,
                  loading: deletingUserId === user.id,
                }}
                okText="削除"
                onConfirm={() => deleteMember(user.id)}
                title="アカウント削除"
              >
                <Button
                  danger
                  disabled={user.id === currentUserId || Boolean(deletingUserId)}
                  icon={<DeleteOutlined />}
                  loading={deletingUserId === user.id}
                  title={user.id === currentUserId ? "現在のアカウントは削除できません" : "削除"}
                />
              </Popconfirm>
            </div>
          ))}
        </div>
        <Form
          disabled={memberSubmitting}
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
  unreadCountByTaskId,
  weeks,
}: {
  calendarValue: Dayjs;
  currentUserId: string;
  onCreateTask: (date: Dayjs) => void;
  onSelectDate: (date: Dayjs) => void;
  onSelectTask: (task: CalendarTask) => void;
  selectedDate: Dayjs;
  tasks: CalendarTask[];
  unreadCountByTaskId: Record<string, number>;
  weeks: Dayjs[][];
}) {
  const visibleWeekEventCount = 5;

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
              {week.map((date, dayIndex) => {
                const isCurrentMonth = date.month() === calendarValue.month();
                const isSelected = date.isSame(selectedDate, "day");
                const isToday = date.isSame(dayjs(), "day");
                const restDay = getJapanRestDay(date.format("YYYY-MM-DD"), date.day());
                const hiddenCount = hiddenByDay[dayIndex];

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
                    {hiddenCount > 0 ? (
                      <span
                        className="range-day-more-count"
                        title={`${date.format("M月D日")} の未表示タスク ${hiddenCount}件`}
                      >
                        +{hiddenCount}件
                      </span>
                    ) : null}
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
                const relationLabel = relationLabelForTask(task, currentUserId);
                const priority = priorityMeta[task.priority];
                const priorityColor = prioritySignalColor[task.priority];
                const eventColor = taskColor(task);
                const unreadCount = unreadCountByTaskId[task.id] || 0;

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
                      "--event-color": eventColor.color,
                      "--event-mid": eventColor.mid,
                      "--event-soft": eventColor.soft,
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
                    <span className="range-event-title">{task.title}</span>
                    {unreadCount > 0 ? (
                      <span className="range-event-unread">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function notificationText(notification: TaskNotification) {
  if (notification.type === "assigned") {
    return `${notification.actorName} が「${notification.taskTitle}」を依頼しました`;
  }

  if (notification.type === "done") {
    return `${notification.actorName} が「${notification.taskTitle}」を完了しました`;
  }

  return `${notification.actorName} が「${notification.taskTitle}」にコメントしました`;
}

function NotificationPanel({
  notifications,
  onOpenTask,
  unreadCount,
}: {
  notifications: TaskNotification[];
  onOpenTask: (taskId: string) => void;
  unreadCount: number;
}) {
  return (
    <div className="notification-panel">
      <div className="notification-panel-header">
        <Text strong>通知</Text>
        <Text type="secondary">
          未読 {unreadCount} / 全 {notifications.length}
        </Text>
      </div>
      {notifications.length === 0 ? (
        <Empty description="通知はありません" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => (
            <button
              className={`notification-item ${notification.readAt ? "is-read" : "is-unread"}`}
              key={notification.id}
              onClick={() => onOpenTask(notification.taskId)}
              type="button"
            >
              <Avatar style={{ backgroundColor: notification.actorColor }}>
                {initials(notification.actorName)}
              </Avatar>
              <div>
                <div className="notification-title">
                  {notificationText(notification)}
                </div>
                <div className="notification-meta">
                  <span>{dayjs(notification.createdAt).format("M月D日 HH:mm")}</span>
                  <Tag color={notification.readAt ? "default" : "red"}>
                    {notification.readAt ? "既読" : "未読"}
                  </Tag>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskDetailCard({
  attachmentSummary,
  currentUserId,
  onOpen,
  task,
  unreadCount,
  userById,
}: {
  attachmentSummary?: TaskAttachmentSummary;
  currentUserId: string;
  onOpen: (task: CalendarTask) => void;
  task: CalendarTask;
  unreadCount: number;
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
  const eventColor = taskColor(task);
  const hasDescription =
    task.description && task.description !== "補足説明はありません。";
  const attachmentCount = attachmentSummary?.count || 0;
  const attachmentLabel =
    attachmentSummary && attachmentCount > 0
      ? attachmentSummary.fileNames.join("、") +
        (attachmentCount > attachmentSummary.fileNames.length
          ? ` ほか${attachmentCount - attachmentSummary.fileNames.length}件`
          : "")
      : null;

  return (
    <button
      className={`task-card task-card-button relation-${relation} is-${task.status}`}
      onClick={() => onOpen(task)}
      style={
        {
          "--task-card-accent": eventColor.color,
          "--task-card-border": eventColor.mid,
          "--task-card-mid": eventColor.mid,
          "--task-card-soft": eventColor.soft,
        } as CSSProperties
      }
      type="button"
    >
      <div className="task-card-header">
        <Title className="task-card-title-scroll" level={5}>
          {task.title}
        </Title>
        <Space size={6}>
          {unreadCount > 0 ? (
            <Tag className="task-card-unread" color="red">
              未読 {unreadCount}
            </Tag>
          ) : null}
          <Tag className="task-card-status" color={status.color}>
            {status.label}
          </Tag>
        </Space>
      </div>
      <div className="task-card-time">
        <ClockCircleOutlined />
        <span>{formatTaskRange(task)}</span>
      </div>
      <div className="task-card-tags">
        <Tag color={relationStyle.color}>{relationLabel}</Tag>
        <Tag color={priority.color}>優先度 {priority.label}</Tag>
      </div>
      {hasDescription ? (
        <p className="task-card-description">{task.description}</p>
      ) : null}
      {attachmentLabel ? (
        <div className="task-card-attachment">
          <PaperClipOutlined />
          <span>{attachmentCount}件</span>
          <Text type="secondary">{attachmentLabel}</Text>
        </div>
      ) : null}
      <div className="task-card-footer">
        <div className="task-card-creator">
          <Text type="secondary">依頼者</Text>
          <span>{creator?.name || "不明"}</span>
        </div>
        <div className="task-card-assignees">
          <Text type="secondary">担当者</Text>
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
      </div>
    </button>
  );
}

function TaskActionModal({
  attachments,
  comments,
  commentSubmitting,
  currentUserId,
  deleting,
  extrasLoading,
  onAddComment,
  onDelete,
  onClose,
  onStatusChange,
  statusUpdating,
  task,
  userById,
}: {
  attachments: TaskAttachment[];
  comments: TaskComment[];
  commentSubmitting: boolean;
  currentUserId: string;
  deleting: boolean;
  extrasLoading: boolean;
  onAddComment: (
    taskId: string,
    body: string,
    attachments: CommentAttachmentDraft[],
  ) => Promise<boolean>;
  onDelete: (task: CalendarTask) => void;
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
  statusUpdating: TaskStatus | null;
  task: CalendarTask | null;
  userById: Map<string, CalendarUser>;
}) {
  const [commentBody, setCommentBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    CommentAttachmentDraft[]
  >([]);
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(
    null,
  );

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
  const canComplete = task.status === "todo";
  const canReject = task.status === "done" && task.createdBy === currentUserId;
  const statusChanging = Boolean(statusUpdating);
  const attachmentsByCommentId = new Map<string, TaskAttachment[]>();

  attachments.forEach((attachment) => {
    const commentAttachments = attachmentsByCommentId.get(attachment.commentId) || [];
    commentAttachments.push(attachment);
    attachmentsByCommentId.set(attachment.commentId, commentAttachments);
  });

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      if (commentSubmitting) {
        return false;
      }

      setPendingAttachments((current) => [
        ...current,
        fileToAttachmentDraft(file),
      ]);

      return false;
    },
    disabled: commentSubmitting,
    fileList: [],
    multiple: true,
    showUploadList: false,
  };
  const submitComment = async () => {
    const created = await onAddComment(task.id, commentBody, pendingAttachments);

    if (created) {
      setCommentBody("");
      setPendingAttachments([]);
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
              <Button
                danger
                disabled={statusChanging}
                icon={<DeleteOutlined />}
                loading={deleting}
              >
                タスク削除
              </Button>
            </Popconfirm>
          ) : null}
          {canReject ? (
            <Button
              disabled={statusChanging}
              loading={statusUpdating === "todo"}
              onClick={() => onStatusChange(task.id, "todo")}
            >
              差し戻し
            </Button>
          ) : null}
          {canComplete ? (
            <Button
              disabled={statusChanging}
              loading={statusUpdating === "done"}
              onClick={() => onStatusChange(task.id, "done")}
              type="primary"
            >
              完了
            </Button>
          ) : null}
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
            <Text strong>添付ファイル</Text>
            {extrasLoading ? <Spin size="small" /> : null}
          </div>
          <div className="task-attachment-list">
            {attachments.length === 0 ? (
              <Text type="secondary">添付ファイルはありません。</Text>
            ) : (
              attachments.map((attachment) => (
                <TaskAttachmentItem
                  attachment={attachment}
                  key={attachment.id}
                  onPreview={setPreviewAttachment}
                  userById={userById}
                />
              ))
            )}
          </div>
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
                const commentAttachments =
                  attachmentsByCommentId.get(comment.id) || [];

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
                      {comment.body ? <p>{comment.body}</p> : null}
                      {commentAttachments.length > 0 ? (
                        <div className="task-comment-attachments">
                          {commentAttachments.map((attachment) => (
                            <TaskAttachmentItem
                              attachment={attachment}
                              key={attachment.id}
                              onPreview={setPreviewAttachment}
                              userById={userById}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Input.TextArea
            disabled={commentSubmitting}
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder="コメントを入力"
            rows={3}
            value={commentBody}
          />
          {pendingAttachments.length > 0 ? (
            <PendingAttachmentList
              attachments={pendingAttachments}
              disabled={commentSubmitting}
              onRemove={(uid) =>
                setPendingAttachments((current) =>
                  current.filter((attachment) => attachment.uid !== uid),
                )
              }
            />
          ) : null}
          <div className="task-comment-compose-actions">
            <Upload {...uploadProps}>
              <Button disabled={commentSubmitting} icon={<UploadOutlined />}>
                アップロード
              </Button>
            </Upload>
            <Button
              disabled={
                commentSubmitting ||
                (!commentBody.trim() && pendingAttachments.length === 0)
              }
              icon={<SendOutlined />}
              loading={commentSubmitting}
              onClick={submitComment}
              type="primary"
            >
              送信
            </Button>
          </div>
        </div>
      </div>
      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </Modal>
  );
}

function PendingAttachmentList({
  attachments,
  disabled = false,
  onRemove,
}: {
  attachments: CommentAttachmentDraft[];
  disabled?: boolean;
  onRemove: (uid: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="task-pending-attachment-list">
      {attachments.map((attachment) => (
        <div className="task-pending-attachment-item" key={attachment.uid}>
          <PaperClipOutlined />
          <span>{attachment.fileName}</span>
          <Text type="secondary">{formatFileSize(attachment.fileSize)}</Text>
          <Button
            disabled={disabled}
            icon={<DeleteOutlined />}
            onClick={() => onRemove(attachment.uid)}
            size="small"
            type="text"
          />
        </div>
      ))}
    </div>
  );
}

function TaskAttachmentItem({
  attachment,
  onPreview,
  userById,
}: {
  attachment: TaskAttachment;
  onPreview: (attachment: TaskAttachment) => void;
  userById: Map<string, CalendarUser>;
}) {
  const uploader = attachment.uploadedBy ? userById.get(attachment.uploadedBy) : null;
  const sizeLabel = formatFileSize(attachment.fileSize);
  const meta = [
    sizeLabel,
    uploader?.name,
    attachment.uploadStatus === "pending" ? "OSS 未連携" : null,
    dayjs(attachment.createdAt).format("M月D日 HH:mm"),
  ]
    .filter(Boolean)
    .join(" · ");
  const canOpen = Boolean(attachment.fileUrl);

  return (
    <div className="task-attachment-item">
      <div className="task-attachment-info">
        <PaperClipOutlined />
        <span>{attachment.fileName}</span>
        <Text type="secondary">{meta}</Text>
      </div>
      <Space className="task-attachment-actions" size={6}>
        <Tooltip title="プレビュー">
          <Button
            disabled={!canOpen}
            icon={<EyeOutlined />}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              if (canOpen) {
                onPreview(attachment);
              }
            }}
            size="small"
          />
        </Tooltip>
        <Tooltip title="ダウンロード">
          <Button
            disabled={!canOpen}
            href={canOpen ? `/api/attachments/${attachment.id}/download` : undefined}
            icon={<DownloadOutlined />}
            onClick={(event) => event.stopPropagation()}
            size="small"
          />
        </Tooltip>
      </Space>
    </div>
  );
}

function AttachmentPreviewModal({
  attachment,
  onClose,
}: {
  attachment: TaskAttachment | null;
  onClose: () => void;
}) {
  if (!attachment) return null;

  const inlineUrl = `/api/attachments/${attachment.id}/inline`;
  const downloadUrl = `/api/attachments/${attachment.id}/download`;
  const mode = attachmentPreviewMode(attachment);
  const officeUrl = attachment.fileUrl
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
        attachment.fileUrl,
      )}`
    : "";

  return (
    <Modal
      footer={
        <Space>
          <Button href={downloadUrl} icon={<DownloadOutlined />}>
            ダウンロード
          </Button>
          <Button onClick={onClose} type="primary">
            閉じる
          </Button>
        </Space>
      }
      onCancel={onClose}
      open
      title={attachment.fileName}
      width="86vw"
    >
      <div className="attachment-preview-modal-body">
        {mode === "video" ? (
          <video className="attachment-preview-modal-media" controls src={inlineUrl} />
        ) : null}
        {mode === "audio" ? (
          <div className="attachment-preview-modal-audio">
            <audio controls src={inlineUrl} />
          </div>
        ) : null}
        {mode === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={attachment.fileName}
            className="attachment-preview-modal-image"
            src={inlineUrl}
          />
        ) : null}
        {mode === "inline" ? (
          <iframe
            className="attachment-preview-modal-frame"
            src={inlineUrl}
            title={attachment.fileName}
          />
        ) : null}
        {mode === "office" ? (
          <iframe
            className="attachment-preview-modal-frame"
            src={officeUrl}
            title={attachment.fileName}
          />
        ) : null}
        {mode === "unsupported" ? (
          <div className="attachment-preview-modal-empty">
            <Text strong>この形式はブラウザ内プレビューに対応していません。</Text>
            <Text type="secondary">ダウンロードして確認してください。</Text>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
