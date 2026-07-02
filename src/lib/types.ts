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
