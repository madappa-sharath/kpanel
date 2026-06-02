import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { cn } from '#/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export interface Column<T> {
  key: keyof T & string
  header: string
  render?: (row: T) => React.ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
  sortKey?: keyof T & string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: keyof T & string) => void
}

export function DataTable<T>({
  columns,
  data: rawData,
  rowKey,
  onRowClick,
  emptyMessage = 'No data',
  sortKey,
  sortDir,
  onSort,
}: DataTableProps<T>) {
  const data = Array.isArray(rawData) ? rawData : []
  const alignClass = (align: Column<T>['align']) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : undefined
  const justifyClass = (align: Column<T>['align']) =>
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={String(col.key)}
                className={alignClass(col.align)}
                style={{ width: col.width }}
              >
                {col.sortable && onSort ? (
                  <button
                    type="button"
                    className={cn(
                      'inline-flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground',
                      justifyClass(col.align),
                    )}
                    onClick={() => onSort(col.key)}
                  >
                    <span>{col.header}</span>
                    {sortKey === col.key ? (
                      sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="opacity-45" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center py-8 text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={onRowClick ? 'cursor-pointer' : undefined}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={String(col.key)} className={cn(alignClass(col.align))}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[String(col.key)] ?? '—')}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
