import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TableMap, pointsAtCell, cellAround, TableView, tableNodeTypes } from 'prosemirror-tables';
import {
  TABLE_COLUMN_AUTO_MAX_WIDTH,
  TABLE_COLUMN_DEFAULT_WIDTH,
  TABLE_COLUMN_MAX_WIDTH,
  TABLE_COLUMN_MIN_WIDTH,
  clampTableColumnWidth
} from './table-constants';

export const columnResizingWithMaxPluginKey = new PluginKey<ResizeState>('tableColumnResizingWithMax');

type DraggingState = {
  startX: number;
  startWidth: number;
};

const isValidWidth = (value: unknown): value is number => typeof value === 'number' && value > 0;
let activeResizeView: EditorView | null = null;

export class ResizeState {
  activeHandle: number;
  dragging: DraggingState | false;

  constructor(activeHandle: number, dragging: DraggingState | false) {
    this.activeHandle = activeHandle;
    this.dragging = dragging;
  }

  apply(tr: any) {
    const action = tr.getMeta(columnResizingWithMaxPluginKey);
    if (action && action.setHandle != null) {
      return new ResizeState(action.setHandle, false);
    }
    if (action && action.setDragging !== undefined) {
      return new ResizeState(this.activeHandle, action.setDragging);
    }
    if (this.activeHandle > -1 && tr.docChanged) {
      let handle = tr.mapping.map(this.activeHandle, -1);
      if (!pointsAtCell(tr.doc.resolve(handle))) handle = -1;
      return new ResizeState(handle, this.dragging);
    }
    return this;
  }
}

const domCellAround = (target: EventTarget | null) => {
  let current = target as HTMLElement | null;
  while (current && current.nodeName !== 'TD' && current.nodeName !== 'TH') {
    if (current.classList && current.classList.contains('ProseMirror')) return null;
    current = current.parentNode as HTMLElement | null;
  }
  return current;
};

const edgeCell = (view: EditorView, event: MouseEvent, side: 'left' | 'right', handleWidth: number) => {
  const offset = side === 'right' ? -handleWidth : handleWidth;
  const found = view.posAtCoords({ left: event.clientX + offset, top: event.clientY });
  if (!found) return -1;
  const $cell = cellAround(view.state.doc.resolve(found.pos));
  if (!$cell) return -1;
  if (side === 'right') return $cell.pos;
  const map = TableMap.get($cell.node(-1));
  const start = $cell.start(-1);
  const index = map.map.indexOf($cell.pos - start);
  return index % map.width === 0 ? -1 : start + map.map[index - 1];
};

const currentColWidth = (view: EditorView, cellPos: number, { colspan, colwidth }: any) => {
  const width = colwidth && colwidth[colwidth.length - 1];
  if (width) return width;
  const dom = view.domAtPos(cellPos);
  let domWidth = (dom.node as HTMLElement).childNodes[dom.offset].offsetWidth;
  let parts = colspan;
  if (colwidth) {
    for (let i = 0; i < colspan; i++) {
      if (colwidth[i]) {
        domWidth -= colwidth[i];
        parts--;
      }
    }
  }
  return domWidth / parts;
};

const updateHandle = (view: EditorView, value: number) => {
  view.dispatch(view.state.tr.setMeta(columnResizingWithMaxPluginKey, { setHandle: value }));
};

const zeroes = (count: number) => Array(count).fill(0);

const updateColumnsOnResizeWithDefaults = (
  node: PMNode,
  colgroup: HTMLTableColElement,
  table: HTMLTableElement,
  defaultCellMinWidth: number,
  overrideCol?: number,
  overrideValue?: number
) => {
  const row = node.firstChild;
  if (!row) return;

  const map = TableMap.get(node);
  const colCount = map.width;
  const colWidths = new Array(colCount).fill(defaultCellMinWidth);
  const colHasWidth = new Array(colCount).fill(false);

  let col = 0;
  for (let i = 0; i < row.childCount && col < colCount; i++) {
    const cell = row.child(i);
    const colspan = cell.attrs.colspan || 1;
    const colwidth = Array.isArray(cell.attrs.colwidth) ? cell.attrs.colwidth : [];
    for (let j = 0; j < colspan && col < colCount; j++, col++) {
      const width = overrideCol === col ? overrideValue : Number(colwidth[j] || 0);
      if (isValidWidth(width)) {
        colWidths[col] = width;
        colHasWidth[col] = true;
      }
    }
  }

  const lastCol = colCount - 1;
  let nextDOM: ChildNode | null = colgroup.firstChild;

  for (let i = 0; i < colCount; i++) {
    const isLast = i === lastCol;
    const shouldSetWidth = !isLast || colHasWidth[i];
    const cssWidth = shouldSetWidth ? `${colWidths[i]}px` : "";

    if (!nextDOM) {
      const colEl = document.createElement("col");
      colEl.style.width = cssWidth;
      colgroup.appendChild(colEl);
    } else {
      const colEl = nextDOM as HTMLTableColElement;
      if (colEl.style.width !== cssWidth) colEl.style.width = cssWidth;
      nextDOM = nextDOM.nextSibling;
    }
  }

  while (nextDOM) {
    const after = nextDOM.nextSibling;
    nextDOM.parentNode?.removeChild(nextDOM);
    nextDOM = after;
  }

  const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
  const fixedWidth = colHasWidth.every(Boolean);
  if (fixedWidth) {
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = "";
  } else {
    table.style.width = "";
    table.style.minWidth = `${totalWidth}px`;
  }
};

const updateColumnWidth = (view: EditorView, cell: number, width: number, minWidth: number, maxWidth: number) => {
  const clampedWidth = clampTableColumnWidth(width, minWidth, maxWidth);
  const $cell = view.state.doc.resolve(cell);
  const table = $cell.node(-1);
  const map = TableMap.get(table);
  const start = $cell.start(-1);
  const col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1;
  const tr = view.state.tr;

  for (let row = 0; row < map.height; row++) {
    const mapIndex = row * map.width + col;
    if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) continue;
    const pos = map.map[mapIndex];
    const attrs = table.nodeAt(pos)!.attrs;
    const index = attrs.colspan === 1 ? 0 : col - map.colCount(pos);
    if (attrs.colwidth && attrs.colwidth[index] === clampedWidth) continue;
    const colwidth = attrs.colwidth ? attrs.colwidth.slice() : zeroes(attrs.colspan);
    colwidth[index] = clampedWidth;
    tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth });
  }

  if (tr.docChanged) view.dispatch(tr);
};

const displayColumnWidth = (
  view: EditorView,
  cell: number,
  width: number,
  defaultCellMinWidth: number,
  minWidth: number,
  maxWidth: number
) => {
  const clampedWidth = clampTableColumnWidth(width, minWidth, maxWidth);
  const $cell = view.state.doc.resolve(cell);
  const table = $cell.node(-1);
  const start = $cell.start(-1);
  const col = TableMap.get(table).colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1;
  let dom = view.domAtPos($cell.start(-1)).node as HTMLElement | null;
  while (dom && dom.nodeName !== 'TABLE') dom = dom.parentNode as HTMLElement | null;
  if (!dom) return;
  updateColumnsOnResizeWithDefaults(
    table,
    dom.firstChild as HTMLTableColElement,
    dom as HTMLTableElement,
    defaultCellMinWidth,
    col,
    clampedWidth
  );
};

const draggedWidth = (dragging: DraggingState, event: MouseEvent, minWidth: number, maxWidth: number) => {
  const offset = event.clientX - dragging.startX;
  return clampTableColumnWidth(dragging.startWidth + offset, minWidth, maxWidth);
};

const handleDecorations = (state: any, cell: number) => {
  const decorations: any[] = [];
  const $cell = state.doc.resolve(cell);
  const table = $cell.node(-1);
  if (!table) return DecorationSet.empty;
  const map = TableMap.get(table);
  const start = $cell.start(-1);
  const col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1;
  for (let row = 0; row < map.height; row++) {
    const index = col + row * map.width;
    if (
      (col === map.width - 1 || map.map[index] !== map.map[index + 1]) &&
      (row === 0 || map.map[index] !== map.map[index - map.width])
    ) {
      const cellPos = map.map[index];
      const pos = start + cellPos + table.nodeAt(cellPos)!.nodeSize - 1;
      const dom = document.createElement('div');
      dom.className = 'column-resize-handle';
      dom.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!activeResizeView) return;
        const autoWidth = getAutoColumnWidth(activeResizeView, start + cellPos);
        updateColumnWidth(activeResizeView, start + cellPos, autoWidth, TABLE_COLUMN_MIN_WIDTH, TABLE_COLUMN_AUTO_MAX_WIDTH);
      });
      const pluginState = columnResizingWithMaxPluginKey.getState(state);
      if (pluginState?.dragging) {
        decorations.push(Decoration.node(start + cellPos, start + cellPos + table.nodeAt(cellPos)!.nodeSize, {
          class: 'column-resize-dragging'
        }));
      }
      decorations.push(Decoration.widget(pos, dom));
    }
  }
  return DecorationSet.create(state.doc, decorations);
};

export class MemoTableView extends TableView {
  constructor(node: PMNode, defaultCellMinWidth: number, _view: EditorView) {
    super(node, defaultCellMinWidth);
    this.table.style.setProperty("--default-cell-min-width", `${defaultCellMinWidth}px`);
    updateColumnsOnResizeWithDefaults(node, this.colgroup, this.table, defaultCellMinWidth);
  }

  update(node: PMNode) {
    if (node.type != this.node.type) return false;
    this.node = node;
    updateColumnsOnResizeWithDefaults(node, this.colgroup, this.table, this.defaultCellMinWidth);
    return true;
  }
}

const measureCellContentWidth = (cell: HTMLElement) => {
  const prevWhiteSpace = cell.style.whiteSpace;
  const prevWidth = cell.style.width;
  const prevMaxWidth = cell.style.maxWidth;
  const prevDisplay = cell.style.display;
  cell.style.whiteSpace = 'nowrap';
  cell.style.width = 'auto';
  cell.style.maxWidth = 'none';
  cell.style.display = 'inline-block';
  const width = Math.ceil(cell.scrollWidth || cell.getBoundingClientRect().width || 0);
  cell.style.whiteSpace = prevWhiteSpace;
  cell.style.width = prevWidth;
  cell.style.maxWidth = prevMaxWidth;
  cell.style.display = prevDisplay;
  return width;
};

const getAutoColumnWidth = (view: EditorView, cellPos: number) => {
  const $cell = view.state.doc.resolve(cellPos);
  const table = $cell.node(-1);
  const map = TableMap.get(table);
  const start = $cell.start(-1);
  const col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1;
  let maxWidth = 0;

  for (let row = 0; row < map.height; row++) {
    const mapIndex = row * map.width + col;
    if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) continue;
    const cellOffset = map.map[mapIndex];
    const cellNode = table.nodeAt(cellOffset);
    if (!cellNode) continue;
    const span = cellNode.attrs.colspan || 1;
    const dom = view.nodeDOM(start + cellOffset) as HTMLElement | null;
    const cellEl = dom && (dom.nodeName === 'TD' || dom.nodeName === 'TH') ? dom : dom?.closest('td, th');
    if (!cellEl) continue;
    const measured = measureCellContentWidth(cellEl);
    const perCol = Math.max(1, Math.ceil(measured / span));
    maxWidth = Math.max(maxWidth, perCol);
  }

  return clampTableColumnWidth(maxWidth + 10, TABLE_COLUMN_MIN_WIDTH, TABLE_COLUMN_AUTO_MAX_WIDTH);
};

export const columnResizingWithMax = ({
  handleWidth = 5,
  cellMinWidth = TABLE_COLUMN_MIN_WIDTH,
  defaultCellMinWidth = TABLE_COLUMN_DEFAULT_WIDTH,
  View = MemoTableView as unknown as new (node: PMNode, cellMinWidth: number, view: EditorView) => NodeView,
  lastColumnResizable = true,
  cellMaxWidth = TABLE_COLUMN_MAX_WIDTH
} = {}) => {
  const plugin = new Plugin({
    key: columnResizingWithMaxPluginKey,
    view: view => {
      const onDblClick = (event: MouseEvent) => {
        if (!view.editable) return;
        let cell = -1;
        const handleTarget = (event.target as HTMLElement | null)?.closest?.('.column-resize-handle');
        if (handleTarget) {
          const cellEl = handleTarget.closest('td, th');
          if (cellEl) {
            const pos = view.posAtDOM(cellEl, 0);
            if (pos != null) cell = pos;
          }
        } else {
          const target = domCellAround(event.target);
          if (target) {
            const { left, right } = target.getBoundingClientRect();
            if (event.clientX - left <= handleWidth) {
              cell = edgeCell(view, event, 'left', handleWidth);
            } else if (right - event.clientX <= handleWidth) {
              cell = edgeCell(view, event, 'right', handleWidth);
            }
          }
        }
        if (cell === -1) return;
        const autoWidth = getAutoColumnWidth(view, cell);
        updateColumnWidth(view, cell, autoWidth, TABLE_COLUMN_MIN_WIDTH, TABLE_COLUMN_AUTO_MAX_WIDTH);
        event.preventDefault();
        event.stopPropagation();
      };

      activeResizeView = view;
      view.dom.addEventListener('dblclick', onDblClick, true);
      return {
        update: nextView => {
          activeResizeView = nextView;
        },
        destroy: () => {
          view.dom.removeEventListener('dblclick', onDblClick, true);
          if (activeResizeView === view) activeResizeView = null;
        }
      };
    },
    state: {
      init(_, state) {
        const nodeViews = plugin.spec.props?.nodeViews;
        const tableName = tableNodeTypes(state.schema).table.name;
        if (View && nodeViews) {
          nodeViews[tableName] = (node, view) => new View(node, defaultCellMinWidth, view);
        }
        return new ResizeState(-1, false);
      },
      apply(tr, prev) {
        return prev.apply(tr);
      }
    },
    props: {
      attributes: state => {
        const pluginState = columnResizingWithMaxPluginKey.getState(state);
        return pluginState && pluginState.activeHandle > -1 ? { class: 'resize-cursor' } : {};
      },
      handleDOMEvents: {
        mousemove: (view, event) => {
          if (!view.editable) return;
          const pluginState = columnResizingWithMaxPluginKey.getState(view.state);
          if (!pluginState) return;
          if (!pluginState.dragging) {
            const target = domCellAround(event.target);
            let cell = -1;
            if (target) {
              const { left, right } = target.getBoundingClientRect();
              if (event.clientX - left <= handleWidth) {
                cell = edgeCell(view, event, 'left', handleWidth);
              } else if (right - event.clientX <= handleWidth) {
                cell = edgeCell(view, event, 'right', handleWidth);
              }
            }
            if (cell !== pluginState.activeHandle) {
              if (!lastColumnResizable && cell !== -1) {
                const $cell = view.state.doc.resolve(cell);
                const table = $cell.node(-1);
                const map = TableMap.get(table);
                const tableStart = $cell.start(-1);
                if (map.colCount($cell.pos - tableStart) + $cell.nodeAfter.attrs.colspan - 1 === map.width - 1) {
                  return;
                }
              }
              updateHandle(view, cell);
            }
          }
        },
        mouseleave: view => {
          if (!view.editable) return;
          const pluginState = columnResizingWithMaxPluginKey.getState(view.state);
          if (pluginState && pluginState.activeHandle > -1 && !pluginState.dragging) {
            updateHandle(view, -1);
          }
        },
        mousedown: (view, event) => {
          if (!view.editable) return false;
          const win = view.dom.ownerDocument.defaultView || window;
          const pluginState = columnResizingWithMaxPluginKey.getState(view.state);
          if (!pluginState || pluginState.activeHandle === -1 || pluginState.dragging) return false;
          const cell = view.state.doc.nodeAt(pluginState.activeHandle);
          if (!cell) return false;
          const width = currentColWidth(view, pluginState.activeHandle, cell.attrs);
          view.dispatch(view.state.tr.setMeta(columnResizingWithMaxPluginKey, {
            setDragging: { startX: event.clientX, startWidth: width }
          }));
          const body = win.document.body;
          body?.classList.add('table-resize-cursor');
          let hasMoved = false;

          const finish = (eventUp: MouseEvent) => {
            win.removeEventListener('mouseup', finish);
            win.removeEventListener('mousemove', move);
            body?.classList.remove('table-resize-cursor');
            const nextState = columnResizingWithMaxPluginKey.getState(view.state);
            if (nextState?.dragging) {
              if (!hasMoved && nextState.dragging.startWidth > cellMaxWidth) {
                view.dispatch(view.state.tr.setMeta(columnResizingWithMaxPluginKey, { setDragging: null }));
                return;
              }
              updateColumnWidth(
                view,
                nextState.activeHandle,
                draggedWidth(nextState.dragging, eventUp, cellMinWidth, cellMaxWidth),
                cellMinWidth,
                cellMaxWidth
              );
              view.dispatch(view.state.tr.setMeta(columnResizingWithMaxPluginKey, { setDragging: null }));
            }
          };

          const move = (eventMove: MouseEvent) => {
            if (!eventMove.which) return finish(eventMove);
            const nextState = columnResizingWithMaxPluginKey.getState(view.state);
            if (!nextState?.dragging) return;
            hasMoved = true;
            const dragged = draggedWidth(nextState.dragging, eventMove, cellMinWidth, cellMaxWidth);
            displayColumnWidth(view, nextState.activeHandle, dragged, defaultCellMinWidth, cellMinWidth, cellMaxWidth);
          };

          if (width <= cellMaxWidth) {
            displayColumnWidth(view, pluginState.activeHandle, width, defaultCellMinWidth, cellMinWidth, cellMaxWidth);
          }
          win.addEventListener('mouseup', finish);
          win.addEventListener('mousemove', move);
          event.preventDefault();
          return true;
        },
        dblclick: (view, event) => {
          if (!view.editable) return false;
          const pluginState = columnResizingWithMaxPluginKey.getState(view.state);
          if (!pluginState) return false;
          let cell = pluginState.activeHandle;
          if (cell === -1) {
            const target = domCellAround(event.target);
            if (target) {
              const { left, right } = target.getBoundingClientRect();
              if (event.clientX - left <= handleWidth) {
                cell = edgeCell(view, event, 'left', handleWidth);
              } else if (right - event.clientX <= handleWidth) {
                cell = edgeCell(view, event, 'right', handleWidth);
              }
            }
          }
          if (cell === -1) return false;
          const autoWidth = getAutoColumnWidth(view, cell);
          updateColumnWidth(view, cell, autoWidth, TABLE_COLUMN_MIN_WIDTH, TABLE_COLUMN_AUTO_MAX_WIDTH);
          event.preventDefault();
          return true;
        }
      },
      decorations: state => {
        const pluginState = columnResizingWithMaxPluginKey.getState(state);
        if (pluginState && pluginState.activeHandle > -1) {
          return handleDecorations(state, pluginState.activeHandle);
        }
        return null;
      },
      nodeViews: {}
    }
  });

  return plugin;
};
