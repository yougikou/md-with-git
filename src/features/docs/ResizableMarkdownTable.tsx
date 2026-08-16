import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TableHTMLAttributes, type ThHTMLAttributes } from 'react';
import { Resizable, type ResizeCallbackData } from 'react-resizable';
import { useI18n } from '../../i18n';

const MIN_COLUMN_WIDTH = 96;
const MAX_COLUMN_WIDTH = 720;
const RESIZE_STEP = 16;
const storagePrefix = 'md-with-git:table-widths:';

type ColumnContextValue = {
  widths: number[] | null;
  lastColumnIndex: number;
  resizeColumn: (index: number, width: number, persist?: boolean) => void;
  resetColumn: (index: number) => void;
};

const ColumnContext = createContext<ColumnContextValue | null>(null);

function clampWidth(value: number) {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, value)));
}

function readWidths(storageKey: string): number[] | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
    return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item)) ? value.map(clampWidth) : null;
  } catch {
    return null;
  }
}

function writeWidths(storageKey: string, widths: number[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // Storage can be disabled by the browser. Resizing still works for this view.
  }
}

function ResizableHeaderCell({ node: _node, children, style, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { node?: unknown }) {
  const { t } = useI18n();
  const context = useContext(ColumnContext);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const [columnIndex, setColumnIndex] = useState<number | null>(null);
  useLayoutEffect(() => {
    const index = cellRef.current?.cellIndex;
    if (index !== undefined) setColumnIndex(index);
  }, []);
  if (!context || columnIndex === null) return <th ref={cellRef} style={style} {...props}>{children}</th>;

  const width = context.widths?.[columnIndex];
  if (!width) return <th ref={cellRef} style={style} {...props}>{children}</th>;
  const isLastColumn = columnIndex === context.lastColumnIndex;

  const onResize = (_event: React.SyntheticEvent, data: ResizeCallbackData) => context.resizeColumn(columnIndex, data.size.width, true);
  const onResizeStop = (_event: React.SyntheticEvent, data: ResizeCallbackData) => context.resizeColumn(columnIndex, data.size.width, true);
  const reset = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    context.resetColumn(columnIndex);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      context.resetColumn(columnIndex);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    context.resizeColumn(columnIndex, width + (event.key === 'ArrowRight' ? RESIZE_STEP : -RESIZE_STEP), true);
  };

  const cellStyle = isLastColumn ? { ...style, minWidth: width } : { ...style, width, minWidth: width, maxWidth: width };
  return <Resizable axis="x" width={width} height={1} minConstraints={[MIN_COLUMN_WIDTH, 1]} maxConstraints={[MAX_COLUMN_WIDTH, 1]} resizeHandles={['e']} onResize={onResize} onResizeStop={onResizeStop} handle={<button type="button" className="markdown-table-resize-handle" aria-label={t('tableResizeColumn', { column: columnIndex + 1 })} title={t('tableResizeHint')} onDoubleClick={reset} onKeyDown={onKeyDown} />}><th style={cellStyle} {...props}>{children}</th></Resizable>;
}

export function ResizableMarkdownTable({ node: _node, children, className, style, tableKey, ...props }: TableHTMLAttributes<HTMLTableElement> & { node?: unknown; children?: ReactNode; tableKey: string }) {
  const { t } = useI18n();
  const storageKey = `${storagePrefix}${tableKey}`;
  const tableRef = useRef<HTMLTableElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const defaultWidths = useRef<number[]>([]);
  const [widths, setWidths] = useState<number[] | null>(() => readWidths(storageKey));
  const [viewportWidth, setViewportWidth] = useState(0);

  const resizeColumn = useCallback((index: number, width: number, persist = false) => {
    setWidths((current) => {
      if (!current) return current;
      const next = current.map((item, itemIndex) => itemIndex === index ? clampWidth(width) : item);
      if (persist) writeWidths(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const resetColumn = useCallback((index: number) => {
    const defaultWidth = defaultWidths.current[index];
    if (defaultWidth) resizeColumn(index, defaultWidth, true);
  }, [resizeColumn]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateViewportWidth = () => setViewportWidth(Math.round(viewport.getBoundingClientRect().width));
    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
    if (!cells.length || (widths && widths.length === cells.length)) return;
    const measured = cells.map((cell) => clampWidth(cell.getBoundingClientRect().width));
    defaultWidths.current = measured;
    setWidths(measured);
  }, [widths]);

  if (widths && !defaultWidths.current.length) defaultWidths.current = widths;
  const tableWidth = widths ? Math.max(viewportWidth, widths.reduce((total, width) => total + width, 0)) : undefined;
  const tableStyle: CSSProperties = widths && tableWidth ? { ...style, width: tableWidth, tableLayout: 'fixed' } : style || {};
  const contextValue = { widths, lastColumnIndex: (widths?.length || 1) - 1, resizeColumn, resetColumn };

  return <div ref={viewportRef} className="markdown-table-scroll" aria-label={t('tableScrollable')}><ColumnContext.Provider value={contextValue}><table ref={tableRef} className={`markdown-resizable-table ${className || ''}`.trim()} style={tableStyle} {...props}>{widths && <colgroup>{widths.map((width, index) => <col key={index} style={index === widths.length - 1 ? undefined : { width }} />)}</colgroup>}{children}</table></ColumnContext.Provider></div>;
}

export const resizableMarkdownTableComponents = { th: ResizableHeaderCell };
