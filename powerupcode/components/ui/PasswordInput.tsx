"use client";

import { forwardRef, useState } from "react";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, containerClassName, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className={`relative ${containerClassName ?? ""}`}>
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={`w-full pr-14 ${className ?? ""}`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    );
  }
);

export default PasswordInput;
