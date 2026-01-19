import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { wrappingInputRule } from '@tiptap/core';

export const TaskListNode = TaskList;

export const TaskItemNode = TaskItem.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^☒\s$/,
        type: this.type,
        getAttributes: () => ({ checked: true }),
      }),
      wrappingInputRule({
        find: /^☐\s$/,
        type: this.type,
        getAttributes: () => ({ checked: false }),
      }),
    ];
  },
}).configure({
  nested: true,
});

export { TaskList, TaskItem };
