import React from "react";
import { Star } from "lucide-react";

export default function StarRating({ value = 0, max = 5, size = 18, onChange }) {
  return (
    <div className="inline-flex items-center gap-0.5" data-testid="star-rating">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < value;
        return (
          <button
            key={i}
            type="button"
            disabled={!onChange}
            onClick={() => onChange && onChange(i + 1)}
            className={`${onChange ? "cursor-pointer" : "cursor-default"} ${filled ? "star-on" : "star-off"}`}
            data-testid={`star-${i + 1}`}
            aria-label={`${i + 1} star${i ? "s" : ""}`}
          >
            <Star size={size} fill={filled ? "currentColor" : "none"} />
          </button>
        );
      })}
    </div>
  );
}
