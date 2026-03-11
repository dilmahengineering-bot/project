import { formatDistanceToNow, format, isPast, differenceInDays } from 'date-fns';

export const formatDate = (date) => {
  if (!date) return 'N/A';
  try { return format(new Date(date), 'MMM d, yyyy'); } catch { return 'N/A'; }
};
export const formatDateTime = (date) => {
  if (!date) return 'N/A';
  try { return format(new Date(date), 'MMM d, yyyy HH:mm'); } catch { return 'N/A'; }
};
export const timeAgo = (date) => {
  if (!date) return '';
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }); } catch { return ''; }
};
export const getDeadlineStatus = (task) => {
  const deadline = new Date(task.extended_deadline || task.deadline);
  const isCompleted = ['completed', 'archived'].includes(task.status);
  if (isCompleted) return { type: 'completed', label: 'Completed', cls: 'deadline-green' };
  if (isPast(deadline)) return { type: 'overdue', label: 'Overdue', cls: 'deadline-red' };
  if (task.extended_deadline) return { type: 'extended', label: 'Extended', cls: 'deadline-orange' };
  const days = differenceInDays(deadline, new Date());
  if (days <= 2) return { type: 'urgent', label: days + 'd left', cls: 'deadline-red' };
  if (days <= 7) return { type: 'soon', label: days + 'd left', cls: 'deadline-orange' };
  return { type: 'normal', label: formatDate(deadline), cls: 'deadline-green' };
};
export const getStatusBadge = (status) => {
  const map = {
    pending: { label: 'Pending', cls: 'badge-pending' },
    in_progress: { label: 'In Progress', cls: 'badge-in_progress' },
    completed: { label: 'Completed', cls: 'badge-completed' },
    archived: { label: 'Archived', cls: 'badge-archived' }
  };
  return map[status] || { label: status, cls: '' };
};
export const getPriorityBadge = (priority) => {
  const map = {
    high: { label: 'High', cls: 'badge-high' },
    medium: { label: 'Medium', cls: 'badge-medium' },
    low: { label: 'Low', cls: 'badge-low' }
  };
  return map[priority] || { label: priority, cls: '' };
};
export const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};
export const AVATAR_COLORS = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316'];
