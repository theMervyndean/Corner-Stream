import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password input with a stable eye toggle that:
 *  - Stays perfectly centered (no Tailwind translate-y, so the global
 *    `button:hover { transform }` rule cannot push it off-axis).
 *  - Has a clean hover state with a soft circular highlight.
 *  - Doesn't reflow when toggled because both icons are the same size.
 */
export default function PasswordInput({ value, onChange, id, required = false, minLength, ...rest }) {
  const [show, setShow] = useState(false);
  const testid = rest["data-testid"] || "password";
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        className="pr-11"
        {...rest}
      />
      {/* inset-y-0 + flex centering avoids ANY transform on the button — */}
      {/* so global button hover/active transforms don't displace it.    */}
      <div className="absolute inset-y-0 right-1 flex items-center pointer-events-none">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          data-testid={`${testid}-toggle`}
          className="pointer-events-auto w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-[#0056B3] hover:bg-slate-100 focus:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0056B3]/40 cs-noflip"
          style={{ transform: "none" }}
        >
          {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
