import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: element => element.getAttribute('data-background-color'),
        renderHTML: attributes => {
          return {
            'data-background-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          }
        },
      },
    }
  },
});

export const TableNode = Table.configure({
  resizable: true,
});

export { TableRow, TableHeader };

export const TABLE_COLORS = [
  { name: 'Défaut', value: 'transparent' },
  { name: 'Bleu', value: 'var(--intent-info-bg)' },
  { name: 'Vert', value: 'var(--intent-success-bg)' },
  { name: 'Jaune', value: 'var(--intent-warning-bg)' },
  { name: 'Rouge', value: 'var(--intent-error-bg)' },
  { name: 'Violet', value: 'var(--intent-important-bg)' },
  { name: 'Gris', value: 'var(--gray-100)' },
];
