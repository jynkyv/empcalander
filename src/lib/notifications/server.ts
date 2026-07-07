import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskNotificationType = "comment" | "done";

type TaskNotificationSource = {
  created_by: string;
  task_assignees?: { user_id: string }[] | null;
};

export function getTaskNotificationRecipients(
  task: TaskNotificationSource,
  actorId: string,
) {
  const recipients = new Set<string>();

  recipients.add(task.created_by);
  (task.task_assignees || []).forEach((assignee) => {
    recipients.add(assignee.user_id);
  });
  recipients.delete(actorId);

  return Array.from(recipients);
}

export async function createTaskNotifications({
  actorId,
  admin,
  commentId,
  task,
  taskId,
  type,
}: {
  actorId: string;
  admin: SupabaseClient;
  commentId?: string;
  task: TaskNotificationSource;
  taskId: string;
  type: TaskNotificationType;
}) {
  const recipientIds = getTaskNotificationRecipients(task, actorId);

  if (recipientIds.length === 0) {
    return null;
  }

  return admin.from("task_notifications").insert(
    recipientIds.map((recipientId) => ({
      actor_id: actorId,
      comment_id: commentId || null,
      recipient_id: recipientId,
      task_id: taskId,
      type,
    })),
  );
}
