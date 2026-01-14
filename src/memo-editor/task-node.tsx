import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

export const TaskListNode = TaskList;

export const TaskItemNode = TaskItem.configure({
  nested: true,
});

export { TaskList, TaskItem };
