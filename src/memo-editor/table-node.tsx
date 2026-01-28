import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { tableEditing } from 'prosemirror-tables';
import { columnResizingWithMax, MemoTableView } from './table-resize';
import {
  TABLE_COLUMN_DEFAULT_WIDTH,
  TABLE_COLUMN_MAX_WIDTH,
  TABLE_COLUMN_MIN_WIDTH
} from './table-constants';

export const CustomTableCell = TableCell.extend({});

export const TableNode = Table.extend({
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable && this.editor.isEditable;
    return [
      ...(isResizable
        ? [columnResizingWithMax({
          handleWidth: this.options.handleWidth,
          cellMinWidth: TABLE_COLUMN_MIN_WIDTH,
          defaultCellMinWidth: TABLE_COLUMN_DEFAULT_WIDTH,
          View: this.options.View || MemoTableView,
          lastColumnResizable: this.options.lastColumnResizable,
          cellMaxWidth: TABLE_COLUMN_MAX_WIDTH,
        })]
        : []),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ];
  },
}).configure({
  resizable: true,
  cellMinWidth: TABLE_COLUMN_DEFAULT_WIDTH,
  View: MemoTableView,
});

export { TableRow, TableHeader };
