import { clsx } from "clsx";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export default function Card({ className, children }: CardProps) {
  return (
    <div className={clsx("bg-zinc-950 border border-zinc-900 rounded-xl p-6", className)}>
      {children}
    </div>
  );
}
