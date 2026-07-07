export type UserRole = "admin" | "member";

export type TaskStatus = "todo" | "doing" | "done";

export type TaskPriority = "low" | "normal" | "high";

export type CalendarUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  color: string;
};

export type CalendarTask = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string;
  assigneeIds: string[];
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  uploadedBy?: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  ossObjectKey?: string;
  createdAt: string;
};
