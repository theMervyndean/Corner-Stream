import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ value, onChange, id, required = false, minLength, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        className="pr-10"
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:cs-text-blue transition-colors"
        aria-label={show ? "Hide password" : "Show password"}
        data-testid={`${rest["data-testid"] || "password"}-toggle`}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
