import { Extension, mergeAttributes } from '@tiptap/core';

export const ListKit = Extension.create({
  name: 'listKit',

  addOptions() {
    return {
      HTMLAttributes: {},
      bulletListName: 'bulletList',
      orderedListName: 'orderedList',
      listItemName: 'listItem',
      onListToggle: undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-8': () => this.editor.commands.toggleList(this.options.bulletListName, this.options.listItemName),
      'Mod-Shift-7': () => this.editor.commands.toggleList(this.options.orderedListName, this.options.listItemName),
    };
  },

  addCommands() {
    return {
      toggleListKit:
        () =>
        ({ commands }) => {
          return commands.toggleList(this.options.bulletListName, this.options.listItemName);
        },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
});

export default ListKit;
