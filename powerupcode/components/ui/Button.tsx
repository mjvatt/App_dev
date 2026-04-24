import { clsx } from "clsx";
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export default function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-white text-black hover:bg-zinc-200",
        variant === "secondary" && "border border-zinc-700 text-white hover:border-white",
        variant === "ghost" && "text-zinc-400 hover:text-white",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-5 py-2.5 text-base",
        size === "lg" && "px-7 py-3 text-lg",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
