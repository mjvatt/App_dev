interface XPBarProps {
  current: number;
  max: number;
  level: number;
}

export default function XPBar({ current, max, level }: XPBarProps) {
  const pct = Math.min(max > 0 ? (current / max) * 100 : 0, 100);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-white shrink-0 w-12">Lv {level}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-white rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 shrink-0">
        {current.toLocaleString()}/{max.toLocaleString()} XP
      </span>
    </div>
  );
}
