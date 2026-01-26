import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

export const CustomTableCell = TableCell.extend({});

export const TableNode = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      pinnedColumns: {
        default: [],
        parseHTML: element => {
          const raw = element.getAttribute('data-pinned-columns');
          if (!raw) return [];
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            return [];
          }
        },
        renderHTML: attributes => {
          if (!attributes.pinnedColumns || !attributes.pinnedColumns.length) return {};
          return { 'data-pinned-columns': JSON.stringify(attributes.pinnedColumns) };
        },
      },
    };
  },
}).configure({
  resizable: true,
});

export { TableRow, TableHeader };

