import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const LOG_LINES = [
  { ts: '00:00:00.001', level: 'INFO',  msg: 'Broker starting up...' },
  { ts: '00:00:00.042', level: 'INFO',  msg: 'Loading partition metadata' },
  { ts: '00:00:00.314', level: 'INFO',  msg: 'Consumer group rebalancing' },
  { ts: '00:00:00.628', level: 'WARN',  msg: 'ISR shrunk for unknown topic' },
  { ts: '00:00:01.000', level: 'ERROR', msg: 'UnknownTopicOrPartitionException: This is not the route you are looking for' },
  { ts: '00:00:01.001', level: 'ERROR', msg: 'Message delivery failed. Retries exhausted (3/3)' },
  { ts: '00:00:01.002', level: 'WARN',  msg: 'Routing to dead-letter queue: /dev/null' },
  { ts: '00:00:01.003', level: 'INFO',  msg: 'Sending you home instead' },
]

const levelColor: Record<string, string> = {
  INFO:  'text-muted-foreground',
  WARN:  'text-amber-600 dark:text-amber-400',
  ERROR: 'text-destructive',
}

export function NotFoundPage() {
  const path = window.location.pathname

  return (
    <>
      <style>{`
        @keyframes kp-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .kp-log-line {
          opacity: 0;
          animation: kp-fade-up 0.35s ease forwards;
        }
      `}</style>

      <div className="relative min-h-screen bg-background flex items-center justify-center px-6 overflow-hidden">

        {/* Ghost watermark */}
        <div className="pointer-events-none select-none absolute inset-0 flex items-center justify-center">
          <span className="text-[22rem] font-black leading-none text-foreground opacity-[0.03]">
            404
          </span>
        </div>

        {/* Card */}
        <div className="relative z-10 w-full max-w-2xl">

          {/* Badge row */}
          <div className="flex items-center gap-2 mb-6">
            <Badge variant="outline" className="font-mono text-[11px] px-2 py-0.5 border-border text-muted-foreground">
              kpanel broker-0
            </Badge>
            <span className="font-mono text-xs text-muted-foreground/50 truncate">{path}</span>
          </div>

          {/* Huge 404 */}
          <h1 className="text-[8rem] font-black leading-none tracking-tighter text-foreground mb-4">
            404
          </h1>

          {/* Description */}
          <p className="text-base text-muted-foreground mb-8 max-w-lg leading-relaxed">
            Topic not found.{' '}
            <span className="font-mono text-sm italic">UnknownTopicOrPartitionException</span>
            {' '}— this route was never produced and has no committed offsets.
          </p>

          {/* Terminal */}
          <div className="rounded-lg border border-border overflow-hidden mb-8">

            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/60 border-b border-border">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-2 font-mono text-xs text-muted-foreground/60">
                kpanel — broker-0 — bash
              </span>
            </div>

            {/* Log output */}
            <div className="bg-zinc-950 dark:bg-black/80 p-4 font-mono text-xs space-y-1.5 overflow-x-auto">
              {LOG_LINES.map((line, i) => (
                <div
                  key={i}
                  className="kp-log-line flex gap-3 whitespace-nowrap"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <span className="text-zinc-600 shrink-0">{line.ts}</span>
                  <span className={`w-11 shrink-0 font-semibold ${levelColor[line.level]}`}>{line.level}</span>
                  <span className="text-zinc-300">{line.msg}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button asChild size="lg">
              <Link to="/welcome">Go home</Link>
            </Button>
            <Button variant="ghost" size="lg" onClick={() => window.history.back()}>
              ← Go back
            </Button>
          </div>

        </div>
      </div>
    </>
  )
}
