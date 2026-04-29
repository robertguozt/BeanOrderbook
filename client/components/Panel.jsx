import React from "react";

export default function Panel({ title, badge, small, children }) {
  return (
    <div className="bg-panel border border-border">
      <div className="px-3 py-2 border-b border-border flex justify-between items-center bg-panel2">
        <span className="text-[10px] tracking-[0.25em] text-dim font-semibold">{title}</span>
        {badge != null && (
          <span className="text-[10px] text-amber tracking-wide px-1.5 py-0.5 border border-border">
            {badge}
          </span>
        )}
      </div>
      <div className={small ? "p-2" : "p-3"}>{children}</div>
    </div>
  );
}
