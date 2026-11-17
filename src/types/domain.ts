export type AppRole =
  | "admin"
  | "preacher"
  | "pa"
  | "musician"
  | "volunteer"
  | "bookstore_staff";

export type TaskStatus =
  | "pending"
  | "assigned"
  | "notified"
  | "acknowledged"
  | "completed"
  | "flagged";

export type Department =
  | "operations"
  | "preacher_logistics"
  | "worship"
  | "volunteer"
  | "bookstore"
  | "ticketing";

export interface Task {
  id: string;
  conference_id: string | null;
  title: string;
  description: string | null;
  department: Department;
  status: TaskStatus;
  due_at: string | null;
  created_by: string;
}
