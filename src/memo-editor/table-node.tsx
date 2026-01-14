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
  { name: 'Bleu', value: '#e0f2fe' },
  { name: 'Vert', value: '#dcfce7' },
  { name: 'Jaune', value: '#fef9c3' },
  { name: 'Rouge', value: '#fee2e2' },
  { name: 'Violet', value: '#f3e8ff' },
  { name: 'Gris', value: '#f3f4f6' },
];
