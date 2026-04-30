import { Button } from '@/components/ui/button'

export type TimeRange = '1h' | '3h' | '6h' | '12h' | '1d' | '3d' | '7d'

const RANGES: TimeRange[] = ['1h', '3h', '6h', '12h', '1d', '3d', '7d']

interface TimeRangePickerProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  return (
    <div className="flex items-center gap-1">
      {RANGES.map((r) => (
        <Button
          key={r}
          size="sm"
          variant={r === value ? 'default' : 'outline'}
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange(r)}
        >
          {r}
        </Button>
      ))}
    </div>
  )
}
