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
  { name: 'Aucun', value: 'var(--bg-none)' },
  { name: 'Gris', value: 'var(--bg-gray)' },
  { name: 'Rouge', value: 'var(--bg-red)' },
  { name: 'Orange', value: 'var(--bg-orange)' },
  { name: 'Jaune', value: 'var(--bg-yellow)' },
  { name: 'Vert', value: 'var(--bg-green)' },
  { name: 'Bleu', value: 'var(--bg-blue)' },
  { name: 'Violet', value: 'var(--bg-purple)' },
];
