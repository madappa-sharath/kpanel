export interface Column<T> {
  key: keyof T & string  // string keys of T only; used as React key and fallback accessor
  header: string
  render?: (row: T) => React.ReactNode
  width?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

export function DataTable<T>({
  columns,
  data: rawData,
  rowKey,
  onRowClick,
  emptyMessage = 'No data',
}: DataTableProps<T>) {
  // Guard: API stubs or unexpected responses may return a non-array
  const data = Array.isArray(rawData) ? rawData : []

  return (
    <div
      style={{
        border:       '1px solid var(--k-border)',
        borderRadius: 6,
        overflow:     'hidden',
        background:   'var(--k-surface)',
      }}
    >
      <table className="k-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} style={{ width: col.width }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  textAlign:  'center',
                  padding:    '32px 14px',
                  color:      'var(--k-muted)',
                  fontFamily: 'var(--k-font)',
                  fontSize:   12,
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'clickable' : undefined}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={String(col.key)}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[String(col.key)] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
