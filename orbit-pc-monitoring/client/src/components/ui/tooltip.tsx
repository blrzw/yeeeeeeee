import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      style={{
        zIndex: 50,
        overflow: "hidden",
        borderRadius: "6px",
        border: "1px solid rgba(255,255,255,.12)",
        backgroundColor: "#1d2124",
        padding: "6px 10px",
        fontSize: "11px",
        color: "#e8e4dc",
        boxShadow: "0 8px 24px rgba(0,0,0,.35)",
      }}
      className={className}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
